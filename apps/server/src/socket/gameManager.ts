import type {
  ClientGameState,
  Color,
  ServerGameState,
  SupportedChain,
} from '@uno/shared';
import { TURN_GRACE_MS } from '@uno/shared';
import {
  acceptWildDrawFour,
  callUno,
  catchUno,
  challengeWildDrawFour,
  createGame,
  drawCard,
  GameError,
  playCard,
  projectForPlayer,
  resolveDrawnCard,
  scoreForWinner,
} from '../game/engine.js';
import { logger } from '../utils/logger.js';

interface ManagedGame {
  state: ServerGameState;
  turnTimer: NodeJS.Timeout | null;
  challengeTimer: NodeJS.Timeout | null;
  /** Last drawn-card pending resolution per playerId. */
  pendingDraw: Map<string, { cardId: string; expiresAt: number }>;
}

type Listener = (state: ServerGameState) => void;

export class GameManager {
  private games = new Map<string, ManagedGame>();
  private listeners = new Map<string, Set<Listener>>();

  create(opts: {
    id: string;
    mode: 'ai' | 'pvp';
    players: Array<{ id: string; address: string; chain: SupportedChain; username?: string }>;
    turnTimeLimit?: number;
    chain?: SupportedChain;
    buyIn?: string;
    escrowGameId?: string;
  }): ServerGameState {
    const state = createGame(opts);
    const managed: ManagedGame = {
      state,
      turnTimer: null,
      challengeTimer: null,
      pendingDraw: new Map(),
    };
    this.games.set(state.id, managed);
    this.scheduleTurnTimer(managed);
    return state;
  }

  get(gameId: string): ServerGameState | undefined {
    return this.games.get(gameId)?.state;
  }

  view(gameId: string, playerId: string): ClientGameState | null {
    const m = this.games.get(gameId);
    if (!m) return null;
    return projectForPlayer(m.state, playerId);
  }

  subscribe(gameId: string, listener: Listener): () => void {
    let set = this.listeners.get(gameId);
    if (!set) {
      set = new Set();
      this.listeners.set(gameId, set);
    }
    set.add(listener);
    return () => set!.delete(listener);
  }

  private notify(gameId: string): void {
    const m = this.games.get(gameId);
    if (!m) return;
    const set = this.listeners.get(gameId);
    if (!set) return;
    for (const l of set) l(m.state);
  }

  // ---------------------------------------------------------------------------
  // Player actions (thin wrappers around engine, plus side effects)
  // ---------------------------------------------------------------------------

  playCard(gameId: string, playerId: string, cardId: string, chosenColor?: Color) {
    const m = this.required(gameId);
    const result = playCard(m.state, playerId, cardId, chosenColor);
    this.afterAction(m, result.gameOver);
    return result;
  }

  drawCard(gameId: string, playerId: string) {
    const m = this.required(gameId);
    const result = drawCard(m.state, playerId);
    m.pendingDraw.set(playerId, { cardId: result.drawnCard.id, expiresAt: Date.now() + 10_000 });
    this.notify(gameId);
    return result;
  }

  resolveDrawnCard(gameId: string, playerId: string, play: boolean, chosenColor?: Color) {
    const m = this.required(gameId);
    const pending = m.pendingDraw.get(playerId);
    if (!pending) throw new GameError('NO_PENDING_DRAW', 'No drawn card to resolve');
    m.pendingDraw.delete(playerId);
    const result = resolveDrawnCard(m.state, playerId, play, pending.cardId, chosenColor);
    this.afterAction(m, result.gameOver);
    return result;
  }

  callUno(gameId: string, playerId: string) {
    const m = this.required(gameId);
    const events = callUno(m.state, playerId);
    this.notify(gameId);
    return events;
  }

  catchUno(gameId: string, catcherId: string, targetPlayerId: string) {
    const m = this.required(gameId);
    const events = catchUno(m.state, catcherId, targetPlayerId);
    this.notify(gameId);
    return events;
  }

  challengeWildDrawFour(gameId: string, challengerId: string) {
    const m = this.required(gameId);
    const result = challengeWildDrawFour(m.state, challengerId);
    this.afterAction(m, result.gameOver);
    return result;
  }

  acceptWildDrawFour(gameId: string, playerId: string) {
    const m = this.required(gameId);
    const result = acceptWildDrawFour(m.state, playerId);
    this.afterAction(m, result.gameOver);
    return result;
  }

  // ---------------------------------------------------------------------------
  // Connection lifecycle
  // ---------------------------------------------------------------------------

  setConnected(gameId: string, playerId: string, connected: boolean): void {
    const m = this.games.get(gameId);
    if (!m) return;
    const player = m.state.players.find((p) => p.id === playerId);
    if (!player) return;
    player.connected = connected;
    this.notify(gameId);
  }

  /** Returns final scores keyed by playerId. */
  finalScores(gameId: string): { playerId: string; score: number }[] {
    const m = this.required(gameId);
    if (!m.state.winnerId) return [];
    const score = scoreForWinner(m.state, m.state.winnerId);
    return m.state.players.map((p) => ({
      playerId: p.id,
      score: p.id === m.state.winnerId ? score : 0,
    }));
  }

  cleanup(gameId: string): void {
    const m = this.games.get(gameId);
    if (!m) return;
    if (m.turnTimer) clearTimeout(m.turnTimer);
    if (m.challengeTimer) clearTimeout(m.challengeTimer);
    this.games.delete(gameId);
    this.listeners.delete(gameId);
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private required(gameId: string): ManagedGame {
    const m = this.games.get(gameId);
    if (!m) throw new GameError('GAME_NOT_FOUND', 'Game not found');
    return m;
  }

  private afterAction(m: ManagedGame, gameOver: boolean): void {
    this.notify(m.state.id);
    if (gameOver) {
      if (m.turnTimer) clearTimeout(m.turnTimer);
      if (m.challengeTimer) clearTimeout(m.challengeTimer);
      return;
    }
    if (m.state.pendingChallenge) {
      this.scheduleChallengeTimer(m);
    } else {
      this.scheduleTurnTimer(m);
    }
  }

  private scheduleTurnTimer(m: ManagedGame): void {
    if (m.turnTimer) clearTimeout(m.turnTimer);
    if (m.state.status !== 'playing') return;
    const remaining = m.state.turnTimeLimit + TURN_GRACE_MS;
    m.turnTimer = setTimeout(() => this.handleTurnTimeout(m), remaining);
  }

  private scheduleChallengeTimer(m: ManagedGame): void {
    if (m.challengeTimer) clearTimeout(m.challengeTimer);
    const pending = m.state.pendingChallenge;
    if (!pending) return;
    const ms = Math.max(0, pending.expiresAt - Date.now());
    m.challengeTimer = setTimeout(() => {
      // Auto-accept the WD4 if no challenge.
      try {
        if (m.state.pendingChallenge) {
          acceptWildDrawFour(m.state, m.state.pendingChallenge.targetPlayerId);
          this.notify(m.state.id);
          this.scheduleTurnTimer(m);
        }
      } catch (err) {
        logger.error({ err, gameId: m.state.id }, 'WD4 auto-accept failed');
      }
    }, ms);
  }

  private handleTurnTimeout(m: ManagedGame): void {
    if (m.state.status !== 'playing') return;
    const cur = m.state.players[m.state.currentPlayerIndex];
    if (!cur) return;
    try {
      drawCard(m.state, cur.id);
      // Auto-pass on the drawn card.
      // Engine's resolveDrawnCard requires us to know the drawn card id; we mimic by advancing.
      // Use a lightweight pass by advancing turn manually after the draw side effect.
      // (drawCard added the card to hand; we now skip to next player.)
      m.state.currentPlayerIndex =
        ((m.state.currentPlayerIndex + m.state.direction) % m.state.players.length +
          m.state.players.length) %
        m.state.players.length;
      m.state.turnStartedAt = Date.now();
      this.notify(m.state.id);
      this.scheduleTurnTimer(m);
    } catch (err) {
      logger.error({ err, gameId: m.state.id }, 'turn timeout handling failed');
    }
  }
}
