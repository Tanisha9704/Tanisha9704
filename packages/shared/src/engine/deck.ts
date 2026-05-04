import type {
  ActionCard,
  ActionValue,
  Card,
  Color,
  NumberCard,
  NumberValue,
  WildCard,
  WildValue,
} from '../types';
import { COLORS, TOTAL_DECK_SIZE } from '../constants';

/**
 * Build a fresh, official 108-card UNO deck.
 *
 * Composition (per Mattel official rules):
 *   - 4 colors x 1 zero = 4 zero cards
 *   - 4 colors x 2 of each 1-9 = 72 cards
 *   - 4 colors x 2 each of Skip/Reverse/Draw Two = 24 cards
 *   - 4 Wild + 4 Wild Draw Four = 8 cards
 * Total = 108
 */
export function buildDeck(): Card[] {
  const deck: Card[] = [];
  let serial = 0;
  const nextId = (prefix: string) => `${prefix}#${serial++}`;

  for (const color of COLORS) {
    deck.push(makeNumber(nextId(`${color[0]}0`), color, 0));
    for (let n = 1; n <= 9; n++) {
      const v = n as NumberValue;
      deck.push(makeNumber(nextId(`${color[0]}${n}A`), color, v));
      deck.push(makeNumber(nextId(`${color[0]}${n}B`), color, v));
    }
    for (const action of ['skip', 'reverse', 'draw_two'] as ActionValue[]) {
      deck.push(makeAction(nextId(`${color[0]}_${action}_A`), color, action));
      deck.push(makeAction(nextId(`${color[0]}_${action}_B`), color, action));
    }
  }
  for (let i = 0; i < 4; i++) {
    deck.push(makeWild(nextId('WILD'), 'wild'));
    deck.push(makeWild(nextId('WD4'), 'wild_draw_four'));
  }

  if (deck.length !== TOTAL_DECK_SIZE) {
    throw new Error(`Deck construction error: built ${deck.length}, expected ${TOTAL_DECK_SIZE}`);
  }
  return deck;
}

function makeNumber(id: string, color: Color, value: NumberValue): NumberCard {
  return { id, kind: 'number', color, value };
}
function makeAction(id: string, color: Color, value: ActionValue): ActionCard {
  return { id, kind: 'action', color, value };
}
function makeWild(id: string, value: WildValue): WildCard {
  return { id, kind: 'wild', color: 'wild', value };
}

/**
 * Cryptographically-seeded Fisher–Yates shuffle. Mutates input and returns it.
 * Uses Web Crypto (available in modern browsers and Node 18+).
 */
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

function secureRandomInt(max: number): number {
  if (max <= 0) throw new Error('max must be positive');
  // Rejection sampling on a 32-bit range to avoid modulo bias.
  const range = 0x1_0000_0000;
  const limit = range - (range % max);
  const buf = new Uint32Array(1);
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj || !cryptoObj.getRandomValues) {
    throw new Error('Web Crypto unavailable; upgrade Node to 18+ or run in a browser');
  }
  while (true) {
    cryptoObj.getRandomValues(buf);
    const n = buf[0]!;
    if (n < limit) return n % max;
  }
}

/**
 * Reshuffle the discard pile back into the draw pile when it runs out.
 * The current top discard card is preserved on top.
 */
export function reshuffleDiscardIntoDeck(discardPile: Card[]): { deck: Card[]; discard: Card[] } {
  if (discardPile.length <= 1) {
    return { deck: [...discardPile], discard: [] };
  }
  const top = discardPile[discardPile.length - 1]!;
  const rest = discardPile.slice(0, -1).map((c) =>
    c.kind === 'wild' ? ({ ...c, color: 'wild' } as Card) : c,
  );
  shuffle(rest);
  return { deck: rest, discard: [top] };
}
