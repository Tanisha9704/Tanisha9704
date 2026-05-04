import { useGameState } from './useGameState';
import {
  createGame,
  playCard,
  drawCard,
  resolveDrawnCard,
  projectForPlayer,
  GameError,
  decideMove,
} from '@uno/shared';
import type { AiDifficulty, ServerGameState } from '@uno/shared';

/**
 * Local AI game runner. The same engine and AI used by the server runs in-browser
 * for solo play — no socket connection required.
 *
 * State is held in module scope keyed by gameId so it survives re-renders without
 * leaking into the wider Zustand store.
 */
const aiGames = new Map<string, ServerGameState>();
const aiDifficulty = new Map<string, AiDifficulty>();

export function useAiGame() {
  const { setGame, setRoute, setGameOver } = useGameState();

  function startAiGame(difficulty: AiDifficulty = 'medium'): string {
    const id = `ai_${Date.now()}`;
    const state = createGame({
      id,
      mode: 'ai',
      players: [
        { id: 'me', address: 'me', chain: 'base' },
        { id: 'ai_1', address: 'ai_1', chain: 'base', username: 'CPU 1' },
        { id: 'ai_2', address: 'ai_2', chain: 'base', username: 'CPU 2' },
      ],
    });
    aiGames.set(id, state);
    aiDifficulty.set(id, difficulty);
    setGame(projectForPlayer(state, 'me'));
    queueAi(id, setGame, setGameOver);
    return id;
  }

  function play(gameId: string, cardId: string, chosenColor?: 'red' | 'blue' | 'green' | 'yellow') {
    const state = aiGames.get(gameId);
    if (!state) return;
    try {
      const r = playCard(state, 'me', cardId, chosenColor);
      setGame(projectForPlayer(state, 'me'));
      if (r.gameOver) setGameOver({ winnerId: r.winnerId!, payoutTxHash: null });
      else queueAi(gameId, setGame, setGameOver);
    } catch (e) {
      if (e instanceof GameError) console.warn(e.message);
    }
  }

  function draw(gameId: string) {
    const state = aiGames.get(gameId);
    if (!state) return;
    const result = drawCard(state, 'me');
    setGame(projectForPlayer(state, 'me'));
    return result;
  }

  function resolveDraw(gameId: string, play: boolean, chosenColor?: 'red' | 'blue' | 'green' | 'yellow') {
    const state = aiGames.get(gameId);
    if (!state) return;
    // Find the most recently drawn card (last in hand).
    const hand = state.players.find((p) => p.id === 'me')!.hand;
    const drawn = hand[hand.length - 1];
    if (!drawn) return;
    try {
      const r = resolveDrawnCard(state, 'me', play, drawn.id, chosenColor);
      setGame(projectForPlayer(state, 'me'));
      if (r.gameOver) setGameOver({ winnerId: r.winnerId!, payoutTxHash: null });
      else queueAi(gameId, setGame, setGameOver);
    } catch (e) {
      if (e instanceof GameError) console.warn(e.message);
    }
  }

  return { startAiGame, play, draw, resolveDraw, _routeUnused: setRoute };
}

function queueAi(
  gameId: string,
  setGame: (g: ReturnType<typeof projectForPlayer>) => void,
  setGameOver: (g: { winnerId: string; payoutTxHash: string | null }) => void,
) {
  const state = aiGames.get(gameId);
  if (!state) return;
  if (state.status !== 'playing') return;
  const cur = state.players[state.currentPlayerIndex]!;
  if (cur.id === 'me') return;

  const delay = 600 + Math.random() * 1200;
  setTimeout(() => {
    if (state.status !== 'playing') return;
    const difficulty = aiDifficulty.get(gameId) ?? 'medium';
    const decision = decideMove(state, cur.id, difficulty);
    try {
      if (decision.type === 'play' && decision.cardId) {
        const r = playCard(state, cur.id, decision.cardId, decision.chosenColor);
        if (r.gameOver) setGameOver({ winnerId: r.winnerId!, payoutTxHash: null });
      } else {
        const drawRes = drawCard(state, cur.id);
        // AI plays the drawn card if playable, else passes.
        const r = resolveDrawnCard(
          state,
          cur.id,
          drawRes.playable,
          drawRes.drawnCard.id,
          drawRes.drawnCard.kind === 'wild' ? pickAiColor(state, cur.id) : undefined,
        );
        if (r.gameOver) setGameOver({ winnerId: r.winnerId!, payoutTxHash: null });
      }
    } catch (e) {
      console.warn('AI action failed', e);
    }
    setGame(projectForPlayer(state, 'me'));
    if (state.status === 'playing' && state.players[state.currentPlayerIndex]!.id !== 'me') {
      queueAi(gameId, setGame, setGameOver);
    }
  }, delay);
}

function pickAiColor(state: ServerGameState, aiId: string) {
  const hand = state.players.find((p) => p.id === aiId)?.hand ?? [];
  const counts = { red: 0, yellow: 0, green: 0, blue: 0 } as Record<'red' | 'yellow' | 'green' | 'blue', number>;
  for (const c of hand) if (c.kind !== 'wild') counts[c.color]++;
  let best: 'red' | 'yellow' | 'green' | 'blue' = 'red';
  for (const k of ['red', 'yellow', 'green', 'blue'] as const) {
    if (counts[k] > counts[best]) best = k;
  }
  return best;
}
