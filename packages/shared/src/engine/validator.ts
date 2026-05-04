import type { Card, Color, ServerGameState, WildColor } from '../types';

export interface PlayLegality {
  legal: boolean;
  reason?: string;
}

/**
 * Can the given card be played on top of the current discard with the active color?
 *
 * Strict official rules (no house rules):
 *   - Match by color, OR by number, OR by symbol (Skip on Skip, etc.)
 *   - Wild can be played on anything.
 *   - Wild Draw Four CAN be played on anything, but is only LEGAL if the player has
 *     no card matching the current color (excluding Wild Draw Fours themselves).
 *     A WD4 is not blocked at the play step — it's challengeable instead.
 */
export function canPlayCard(
  card: Card,
  topDiscard: Card,
  currentColor: WildColor,
): PlayLegality {
  if (card.kind === 'wild') return { legal: true };

  if (card.color === currentColor) return { legal: true };

  if (card.kind === 'number' && topDiscard.kind === 'number' && card.value === topDiscard.value) {
    return { legal: true };
  }
  if (card.kind === 'action' && topDiscard.kind === 'action' && card.value === topDiscard.value) {
    return { legal: true };
  }

  return { legal: false, reason: 'card does not match color, number, or symbol' };
}

/**
 * For Wild Draw Four challenge resolution:
 *   - Did the player have a non-WD4 card matching the prior color?
 *   - If yes, the WD4 was an illegal play.
 */
export function wasWildDrawFourLegal(hand: Card[], priorColor: WildColor): boolean {
  if (priorColor === 'wild') return true; // First card was wild, anything goes.
  for (const c of hand) {
    if (c.kind === 'wild') continue;
    if (c.color === priorColor) return false; // had a matching color, so WD4 was illegal
  }
  return true;
}

export function isPlayersTurn(state: ServerGameState, playerId: string): boolean {
  const current = state.players[state.currentPlayerIndex];
  return !!current && current.id === playerId;
}

export function findCardInHand(hand: Card[], cardId: string): Card | undefined {
  return hand.find((c) => c.id === cardId);
}

export function declaredColorValid(
  card: Card,
  chosenColor: Color | undefined,
): chosenColor is Color {
  if (card.kind !== 'wild') return true as never; // not used for non-wilds
  return (
    !!chosenColor &&
    (chosenColor === 'red' || chosenColor === 'yellow' || chosenColor === 'green' || chosenColor === 'blue')
  );
}
