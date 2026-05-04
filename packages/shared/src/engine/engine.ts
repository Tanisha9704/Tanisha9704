import type {
  Card,
  ClientGameState,
  Color,
  Direction,
  GameEvent,
  PlayerPrivate,
  ServerGameState,
  SupportedChain,
  WildColor,
} from '../types';
import {
  CARD_POINTS,
  DEFAULT_TURN_TIMER_MS,
  STARTING_HAND_SIZE,
  WD4_CHALLENGE_WINDOW_MS,
} from '../constants';
import { buildDeck, reshuffleDiscardIntoDeck, shuffle } from './deck';
import {
  canPlayCard,
  declaredColorValid,
  findCardInHand,
  isPlayersTurn,
  wasWildDrawFourLegal,
} from './validator';

export class GameError extends Error {
  public readonly code: string;
  constructor(code: string, message: string) {
    super(`[${code}] ${message}`);
    this.code = code;
    this.name = 'GameError';
  }
}

export interface CreateGameOptions {
  id: string;
  mode: 'ai' | 'pvp';
  players: Array<{
    id: string;
    address: string;
    chain: SupportedChain;
    username?: string;
  }>;
  turnTimeLimit?: number;
  chain?: SupportedChain;
  buyIn?: string;
  escrowGameId?: string;
}

/**
 * Produce a fresh, dealt game ready to play.
 *
 * Setup behavior on the flipped first discard card:
 *   - Number: normal play
 *   - Skip: first player loses turn
 *   - Reverse: direction flips (in 2p, acts as Skip)
 *   - Draw Two: first player draws 2 and is skipped
 *   - Wild: first player picks the color (handled later when they play)
 *   - Wild Draw Four: re-shuffle and flip again
 */
export function createGame(opts: CreateGameOptions): ServerGameState {
  if (opts.players.length < 2 || opts.players.length > 4) {
    throw new GameError('INVALID_PLAYER_COUNT', 'UNO requires 2-4 players');
  }

  const deck = shuffle(buildDeck());
  const players: PlayerPrivate[] = opts.players.map((p, i) => ({
    id: p.id,
    address: p.address,
    chain: p.chain,
    username: p.username,
    seatIndex: i,
    cardCount: STARTING_HAND_SIZE,
    calledUno: false,
    connected: true,
    hand: deck.splice(0, STARTING_HAND_SIZE),
  }));

  // Flip the starting card. If it's a WD4, return it and flip again.
  let firstCard = deck.pop()!;
  while (firstCard.kind === 'wild' && firstCard.value === 'wild_draw_four') {
    deck.unshift(firstCard);
    shuffle(deck);
    firstCard = deck.pop()!;
  }

  const state: ServerGameState = {
    id: opts.id,
    mode: opts.mode,
    status: 'playing',
    players,
    deck,
    discardPile: [firstCard],
    currentColor: firstCard.kind === 'wild' ? 'wild' : firstCard.color,
    currentPlayerIndex: 0,
    direction: 1,
    turnStartedAt: Date.now(),
    turnTimeLimit: opts.turnTimeLimit ?? DEFAULT_TURN_TIMER_MS,
    pendingChallenge: null,
    winnerId: null,
    escrowGameId: opts.escrowGameId ?? null,
    chain: opts.chain ?? null,
    buyIn: opts.buyIn ?? '0',
    createdAt: Date.now(),
  };

  // Apply effect of the first flipped card.
  if (firstCard.kind === 'action') {
    if (firstCard.value === 'skip') {
      advanceTurn(state);
    } else if (firstCard.value === 'reverse') {
      state.direction = -1 as Direction;
      // In 2-player, Reverse acts as Skip (per official rules).
      if (state.players.length === 2) advanceTurn(state);
      else state.currentPlayerIndex = wrapIndex(state.players.length - 1, state.players.length);
    } else if (firstCard.value === 'draw_two') {
      drawCardsForPlayer(state, state.currentPlayerIndex, 2);
      advanceTurn(state);
    }
  }
  // If firstCard is Wild (plain), the first player picks color when they play.
  // We leave currentColor = 'wild' until then — this is allowed by official rules.

  state.turnStartedAt = Date.now();
  return state;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export interface ActionResult {
  events: GameEvent[];
  gameOver: boolean;
  winnerId: string | null;
}

/**
 * Play a card from a player's hand. Validates turn, legality, and applies effects.
 */
export function playCard(
  state: ServerGameState,
  playerId: string,
  cardId: string,
  chosenColor?: Color,
): ActionResult {
  if (state.status !== 'playing') throw new GameError('NOT_PLAYING', 'Game is not active');
  if (state.pendingChallenge) {
    throw new GameError('PENDING_WD4', 'Resolve the Wild Draw Four challenge first');
  }
  if (!isPlayersTurn(state, playerId)) {
    throw new GameError('NOT_YOUR_TURN', 'Not your turn');
  }

  const player = state.players[state.currentPlayerIndex]!;
  const card = findCardInHand(player.hand, cardId);
  if (!card) throw new GameError('CARD_NOT_IN_HAND', 'Card not in hand');

  const top = state.discardPile[state.discardPile.length - 1]!;
  const legality = canPlayCard(card, top, state.currentColor);
  if (!legality.legal) {
    throw new GameError('ILLEGAL_PLAY', legality.reason ?? 'Illegal move');
  }

  if (card.kind === 'wild' && !declaredColorValid(card, chosenColor)) {
    throw new GameError('COLOR_REQUIRED', 'Must declare a color for a Wild card');
  }

  // Auto-clear UNO flag for everyone except players currently at 1 card; recomputed below.
  // Capture prior color (used by WD4 challenge legality).
  const priorColor: WildColor = state.currentColor;

  // Move card from hand to discard.
  player.hand = player.hand.filter((c) => c.id !== cardId);
  player.cardCount = player.hand.length;
  state.discardPile.push(card);

  const events: GameEvent[] = [];

  if (card.kind === 'wild') {
    // Persist declared color on the card for visual purposes.
    (card as { color: WildColor }).color = chosenColor!;
    state.currentColor = chosenColor!;
  } else {
    state.currentColor = card.color;
  }

  events.push({ type: 'card_played', playerId, card, newColor: state.currentColor });

  // Check win.
  if (player.hand.length === 0) {
    // If last card was a Draw Two, next player still draws 2 (per official rules).
    if (card.kind === 'action' && card.value === 'draw_two') {
      const nextIdx = nextIndex(state);
      drawCardsForPlayer(state, nextIdx, 2);
    }
    // If last card was a WD4, register pending challenge — but the game is already won,
    // we still record the penalty path. Per official rules, the round ends; the next
    // player draws 4 only if there are remaining hands to score.
    if (card.kind === 'wild' && card.value === 'wild_draw_four') {
      const nextIdx = nextIndex(state);
      drawCardsForPlayer(state, nextIdx, 4);
    }
    return finishGame(state, playerId, events);
  }

  // Player must call UNO BEFORE the next turn starts when they have 1 card left.
  // calledUno is reset on every play; they can call between play and next-turn.
  player.calledUno = false;

  // Apply card effect.
  switch (card.kind) {
    case 'number': {
      advanceTurn(state);
      break;
    }
    case 'action': {
      if (card.value === 'skip') {
        advanceTurn(state); // skip: move to next, then advance again
        advanceTurn(state);
      } else if (card.value === 'reverse') {
        state.direction = (-state.direction) as Direction;
        if (state.players.length === 2) {
          advanceTurn(state); // 2p reverse acts as skip — current player retains turn... wait
          advanceTurn(state); // advance twice to land back at *the player who reversed* having
                              // already moved -> in 2p we want them to play again, so we
                              // advance by 2 in the new direction.
        } else {
          advanceTurn(state);
        }
      } else if (card.value === 'draw_two') {
        const targetIdx = nextIndex(state);
        drawCardsForPlayer(state, targetIdx, 2);
        advanceTurn(state);
        advanceTurn(state);
      }
      break;
    }
    case 'wild': {
      if (card.value === 'wild') {
        advanceTurn(state);
      } else {
        // Wild Draw Four: register challenge window. Effect is applied on resolve.
        const targetIdx = nextIndex(state);
        const target = state.players[targetIdx]!;
        const expiresAt = Date.now() + WD4_CHALLENGE_WINDOW_MS;
        state.pendingChallenge = {
          playerId,
          targetPlayerId: target.id,
          priorColor,
          declaredColor: chosenColor!,
          expiresAt,
        };
        events.push({
          type: 'wd4_played',
          playerId,
          targetPlayerId: target.id,
          expiresAt,
        });
        // Turn does NOT advance until resolution.
        return { events, gameOver: false, winnerId: null };
      }
      break;
    }
  }

  state.turnStartedAt = Date.now();
  events.push({
    type: 'turn_change',
    currentPlayerId: state.players[state.currentPlayerIndex]!.id,
    direction: state.direction,
    expiresAt: state.turnStartedAt + state.turnTimeLimit,
  });

  return { events, gameOver: false, winnerId: null };
}

/**
 * Player draws one card from the deck. If playable, they MAY play it immediately
 * via keepDrawn(play=true). Otherwise their turn ends.
 */
export function drawCard(state: ServerGameState, playerId: string): {
  events: GameEvent[];
  drawnCard: Card;
  playable: boolean;
} {
  if (state.status !== 'playing') throw new GameError('NOT_PLAYING', 'Game is not active');
  if (state.pendingChallenge) throw new GameError('PENDING_WD4', 'Resolve the WD4 first');
  if (!isPlayersTurn(state, playerId)) throw new GameError('NOT_YOUR_TURN', 'Not your turn');

  const player = state.players[state.currentPlayerIndex]!;
  const card = takeFromDeck(state, 1)[0]!;
  player.hand.push(card);
  player.cardCount = player.hand.length;

  const top = state.discardPile[state.discardPile.length - 1]!;
  const playable = canPlayCard(card, top, state.currentColor).legal;

  return {
    events: [{ type: 'card_drawn', playerId, cardCount: player.cardCount }],
    drawnCard: card,
    playable,
  };
}

/**
 * Resolution step after drawCard. If `play` is true and the drawn card is legal,
 * play it; otherwise advance the turn.
 */
export function resolveDrawnCard(
  state: ServerGameState,
  playerId: string,
  play: boolean,
  drawnCardId: string,
  chosenColor?: Color,
): ActionResult {
  if (!isPlayersTurn(state, playerId)) throw new GameError('NOT_YOUR_TURN', 'Not your turn');
  if (play) return playCard(state, playerId, drawnCardId, chosenColor);
  // Pass — end turn.
  advanceTurn(state);
  state.turnStartedAt = Date.now();
  return {
    events: [
      {
        type: 'turn_change',
        currentPlayerId: state.players[state.currentPlayerIndex]!.id,
        direction: state.direction,
        expiresAt: state.turnStartedAt + state.turnTimeLimit,
      },
    ],
    gameOver: false,
    winnerId: null,
  };
}

export function callUno(state: ServerGameState, playerId: string): GameEvent[] {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new GameError('NO_PLAYER', 'Player not in game');
  if (player.hand.length !== 1) {
    throw new GameError('NOT_AT_ONE', 'Can only call UNO when you have one card');
  }
  player.calledUno = true;
  return [{ type: 'uno_called', playerId }];
}

/**
 * Catch a player who reached 1 card without calling UNO.
 * The penalty is 2 cards drawn. Window is open until that player's next turn begins.
 */
export function catchUno(
  state: ServerGameState,
  catcherId: string,
  targetPlayerId: string,
): GameEvent[] {
  const target = state.players.find((p) => p.id === targetPlayerId);
  if (!target) throw new GameError('NO_PLAYER', 'Target not in game');
  if (target.hand.length !== 1 || target.calledUno) {
    throw new GameError('CATCH_INVALID', 'Cannot catch this player');
  }
  const idx = state.players.indexOf(target);
  drawCardsForPlayer(state, idx, 2);
  return [
    {
      type: 'uno_caught',
      caughtPlayerId: targetPlayerId,
      catcherPlayerId: catcherId,
      penaltyCount: 2,
    },
  ];
}

/**
 * Challenger calls out a Wild Draw Four. Inspect challenged player's hand:
 *   - illegal play: challenged draws 4 instead, challenger keeps clean turn
 *   - legal play: challenger draws 6 (4 + 2 penalty) and is skipped
 */
export function challengeWildDrawFour(
  state: ServerGameState,
  challengerId: string,
): { events: GameEvent[]; gameOver: boolean; winnerId: string | null } {
  const pending = state.pendingChallenge;
  if (!pending) throw new GameError('NO_CHALLENGE', 'No WD4 to challenge');
  if (pending.targetPlayerId !== challengerId) {
    throw new GameError('NOT_TARGET', 'Only the targeted player can challenge');
  }

  const challenged = state.players.find((p) => p.id === pending.playerId)!;
  const challengedIdx = state.players.indexOf(challenged);
  const challengerIdx = state.players.findIndex((p) => p.id === challengerId);

  // The challenged player's hand at the moment they played WD4 is what we inspect,
  // but they've already played the WD4 (and removed it from hand). We use their
  // CURRENT hand to test legality of the prior color match; this is correct because
  // playing WD4 doesn't add other cards to the hand.
  const wasLegal = wasWildDrawFourLegal(challenged.hand, pending.priorColor);

  let penaltyCardsDrawn: number;
  let challengerOutcome: 'drew' | 'skipped';

  if (!wasLegal) {
    // Challenged player draws 4. Challenger keeps their turn (they play next).
    drawCardsForPlayer(state, challengedIdx, 4);
    penaltyCardsDrawn = 4;
    challengerOutcome = 'skipped';
    state.pendingChallenge = null;
    state.currentPlayerIndex = challengerIdx;
  } else {
    // Challenger draws 6 (4 + 2 penalty) and is skipped.
    drawCardsForPlayer(state, challengerIdx, 6);
    penaltyCardsDrawn = 6;
    challengerOutcome = 'drew';
    state.pendingChallenge = null;
    state.currentPlayerIndex = challengerIdx;
    advanceTurn(state); // skip the challenger
  }

  const events: GameEvent[] = [
    {
      type: 'wd4_resolved',
      challengerId,
      challengedId: challenged.id,
      wasLegal,
      penaltyCardsDrawn,
      challenger: challengerOutcome,
    },
  ];

  state.turnStartedAt = Date.now();
  events.push({
    type: 'turn_change',
    currentPlayerId: state.players[state.currentPlayerIndex]!.id,
    direction: state.direction,
    expiresAt: state.turnStartedAt + state.turnTimeLimit,
  });

  if (challenged.hand.length === 0) {
    return finishGame(state, challenged.id, events);
  }
  return { events, gameOver: false, winnerId: null };
}

/** Target accepts the WD4 without challenge: draws 4 and is skipped. */
export function acceptWildDrawFour(state: ServerGameState, playerId: string): ActionResult {
  const pending = state.pendingChallenge;
  if (!pending) throw new GameError('NO_CHALLENGE', 'No pending WD4');
  if (pending.targetPlayerId !== playerId) {
    throw new GameError('NOT_TARGET', 'You are not the target');
  }
  const targetIdx = state.players.findIndex((p) => p.id === playerId);
  drawCardsForPlayer(state, targetIdx, 4);
  state.pendingChallenge = null;

  // Move turn past the target.
  state.currentPlayerIndex = targetIdx;
  advanceTurn(state);

  state.turnStartedAt = Date.now();
  return {
    events: [
      {
        type: 'turn_change',
        currentPlayerId: state.players[state.currentPlayerIndex]!.id,
        direction: state.direction,
        expiresAt: state.turnStartedAt + state.turnTimeLimit,
      },
    ],
    gameOver: false,
    winnerId: null,
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function advanceTurn(state: ServerGameState): void {
  state.currentPlayerIndex = wrapIndex(
    state.currentPlayerIndex + state.direction,
    state.players.length,
  );
}

function nextIndex(state: ServerGameState): number {
  return wrapIndex(state.currentPlayerIndex + state.direction, state.players.length);
}

function wrapIndex(i: number, mod: number): number {
  return ((i % mod) + mod) % mod;
}

function takeFromDeck(state: ServerGameState, n: number): Card[] {
  const out: Card[] = [];
  for (let i = 0; i < n; i++) {
    if (state.deck.length === 0) {
      const { deck, discard } = reshuffleDiscardIntoDeck(state.discardPile);
      if (deck.length === 0) {
        // Pathological: nothing to draw. End the round at current standings.
        break;
      }
      state.deck = deck;
      state.discardPile = discard;
    }
    out.push(state.deck.pop()!);
  }
  return out;
}

function drawCardsForPlayer(state: ServerGameState, playerIdx: number, n: number): void {
  const player = state.players[playerIdx]!;
  const drawn = takeFromDeck(state, n);
  player.hand.push(...drawn);
  player.cardCount = player.hand.length;
}

function finishGame(
  state: ServerGameState,
  winnerId: string,
  events: GameEvent[],
): ActionResult {
  state.status = 'finished';
  state.winnerId = winnerId;
  return { events, gameOver: true, winnerId };
}

// ---------------------------------------------------------------------------
// Scoring & view projection
// ---------------------------------------------------------------------------

/** Compute round score for a winner: sum of point values across opponents' hands. */
export function scoreForWinner(state: ServerGameState, winnerId: string): number {
  let score = 0;
  for (const p of state.players) {
    if (p.id === winnerId) continue;
    for (const c of p.hand) {
      if (c.kind === 'number') score += CARD_POINTS.number(c.value);
      else if (c.kind === 'action') score += CARD_POINTS.action;
      else score += CARD_POINTS.wild;
    }
  }
  return score;
}

/** Project the server state into a client-safe view (no opponent hands). */
export function projectForPlayer(state: ServerGameState, playerId: string): ClientGameState {
  const top = state.discardPile[state.discardPile.length - 1] ?? null;
  const self = state.players.find((p) => p.id === playerId);
  return {
    id: state.id,
    mode: state.mode,
    status: state.status,
    players: state.players.map((p) => ({
      id: p.id,
      address: p.address,
      chain: p.chain,
      username: p.username,
      seatIndex: p.seatIndex,
      cardCount: p.cardCount,
      calledUno: p.calledUno,
      connected: p.connected,
    })),
    selfHand: self ? [...self.hand] : [],
    topDiscard: top,
    currentColor: state.currentColor,
    currentPlayerIndex: state.currentPlayerIndex,
    direction: state.direction,
    drawPileCount: state.deck.length,
    turnStartedAt: state.turnStartedAt,
    turnTimeLimit: state.turnTimeLimit,
    pendingChallenge: state.pendingChallenge,
    winnerId: state.winnerId,
    payoutTxHash: null,
  };
}
