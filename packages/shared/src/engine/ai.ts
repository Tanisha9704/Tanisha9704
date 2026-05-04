import type {
  Card,
  Color,
  ServerGameState,
} from '../types';
import { COLORS } from '../constants';
import { canPlayCard, wasWildDrawFourLegal } from './validator';

export type AiDifficulty = 'easy' | 'medium' | 'hard';

export interface AiDecision {
  type: 'play' | 'draw';
  cardId?: string;
  chosenColor?: Color;
}

export interface AiChallengeDecision {
  challenge: boolean;
}

/**
 * Pick a move for the AI given the current state and its hand.
 *
 * Strategy levels:
 *   easy:   uniform random over playable cards.
 *   medium: prefer colors that match many cards in hand; play action cards aggressively.
 *   hard:   above + holds Wilds for emergencies; targets player with fewest cards.
 */
export function decideMove(
  state: ServerGameState,
  aiPlayerId: string,
  difficulty: AiDifficulty,
): AiDecision {
  const player = state.players.find((p) => p.id === aiPlayerId);
  if (!player) throw new Error('AI player not in game');

  const top = state.discardPile[state.discardPile.length - 1];
  if (!top) return { type: 'draw' };

  const playable = player.hand.filter((c) => canPlayCard(c, top, state.currentColor).legal);
  if (playable.length === 0) return { type: 'draw' };

  switch (difficulty) {
    case 'easy':
      return playRandom(playable, player.hand);
    case 'medium':
      return playMedium(playable, player.hand);
    case 'hard':
      return playHard(state, aiPlayerId, playable, player.hand);
  }
}

function playRandom(playable: Card[], hand: Card[]): AiDecision {
  const card = playable[Math.floor(Math.random() * playable.length)]!;
  return toDecision(card, hand);
}

function playMedium(playable: Card[], hand: Card[]): AiDecision {
  // Prefer non-wilds first; among non-wilds, prefer action cards.
  const nonWild = playable.filter((c) => c.kind !== 'wild');
  const pool = nonWild.length > 0 ? nonWild : playable;
  const actions = pool.filter((c) => c.kind === 'action');
  const choice = (actions[0] ?? pool[0])!;
  return toDecision(choice, hand);
}

function playHard(
  state: ServerGameState,
  aiPlayerId: string,
  playable: Card[],
  hand: Card[],
): AiDecision {
  const opponents = state.players.filter((p) => p.id !== aiPlayerId);
  const lowestOpp = opponents.reduce((a, b) => (a.cardCount <= b.cardCount ? a : b));
  const threatened = lowestOpp.cardCount <= 2;

  // If under threat, prefer the most punishing playable card.
  if (threatened) {
    const punishOrder = ['wild_draw_four', 'draw_two', 'skip', 'reverse'];
    for (const target of punishOrder) {
      const c = playable.find(
        (p) =>
          (p.kind === 'wild' && p.value === target) ||
          (p.kind === 'action' && p.value === target),
      );
      if (c) return toDecision(c, hand);
    }
  }

  // Otherwise: lower number cards first; reserve wilds for later.
  const nonWild = playable.filter((c) => c.kind !== 'wild');
  if (nonWild.length > 0) {
    nonWild.sort((a, b) => cardWeight(a) - cardWeight(b));
    return toDecision(nonWild[0]!, hand);
  }
  return toDecision(playable[0]!, hand);
}

function cardWeight(c: Card): number {
  if (c.kind === 'number') return c.value;
  if (c.kind === 'action') return 15;
  return 25;
}

function toDecision(card: Card, hand: Card[]): AiDecision {
  if (card.kind === 'wild') {
    return { type: 'play', cardId: card.id, chosenColor: pickColor(hand) };
  }
  return { type: 'play', cardId: card.id };
}

function pickColor(hand: Card[]): Color {
  const counts: Record<Color, number> = { red: 0, yellow: 0, green: 0, blue: 0 };
  for (const c of hand) {
    if (c.kind !== 'wild') counts[c.color]++;
  }
  let best: Color = 'red';
  let bestCount = -1;
  for (const c of COLORS) {
    if (counts[c] > bestCount) {
      bestCount = counts[c];
      best = c;
    }
  }
  return best;
}

/** Should the AI challenge the WD4 currently pending against it? */
export function decideChallenge(
  state: ServerGameState,
  aiPlayerId: string,
  difficulty: AiDifficulty,
): AiChallengeDecision {
  if (!state.pendingChallenge || state.pendingChallenge.targetPlayerId !== aiPlayerId) {
    return { challenge: false };
  }
  if (difficulty === 'easy') return { challenge: false };

  const challenged = state.players.find(
    (p) => p.id === state.pendingChallenge!.playerId,
  );
  // The AI cannot peek at the challenged player's hand. It must guess based on
  // observed history. As a simple heuristic, challenge with low base rate at medium
  // and a higher rate at hard when the prior color matched many of our visible plays.
  if (!challenged) return { challenge: false };
  const ourHand = state.players.find((p) => p.id === aiPlayerId)?.hand ?? [];
  const priorColor = state.pendingChallenge.priorColor;
  const _wasLegal = wasWildDrawFourLegal(ourHand, priorColor); // unused — we can't see opponent's hand
  const baseRate = difficulty === 'medium' ? 0.4 : 0.7;
  return { challenge: Math.random() < baseRate };
}
