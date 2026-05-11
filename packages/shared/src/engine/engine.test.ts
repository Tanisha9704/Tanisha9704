/**
 * Engine tests. Run with: npm test --workspace=@uno/server
 *
 * Uses Node's built-in test runner (node --test) so no extra dependency.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Card, ServerGameState } from '../types';
import { TOTAL_DECK_SIZE } from '../constants';
import { buildDeck } from './deck';
import {
  acceptWildDrawFour,
  callUno,
  catchUno,
  challengeWildDrawFour,
  createGame,
  drawCard,
  playCard,
  scoreForWinner,
} from './engine';

function basicGame(numPlayers = 2): ServerGameState {
  return createGame({
    id: 'g1',
    mode: 'pvp',
    players: Array.from({ length: numPlayers }, (_, i) => ({
      id: `p${i}`,
      address: `0xaddr${i}`,
      chain: 'base' as const,
    })),
    turnTimeLimit: 30_000,
  });
}

describe('deck', () => {
  it('builds a 108-card deck', () => {
    const deck = buildDeck();
    assert.equal(deck.length, TOTAL_DECK_SIZE);
  });

  it('has correct color distribution', () => {
    const deck = buildDeck();
    for (const color of ['red', 'yellow', 'green', 'blue'] as const) {
      const colored = deck.filter((c) => c.color === color);
      assert.equal(colored.length, 25, `${color} should have 25 cards`);
      assert.equal(colored.filter((c) => c.kind === 'number' && c.value === 0).length, 1);
      for (let n = 1; n <= 9; n++) {
        assert.equal(
          colored.filter((c) => c.kind === 'number' && c.value === n).length,
          2,
          `${color} ${n} should appear twice`,
        );
      }
      for (const a of ['skip', 'reverse', 'draw_two'] as const) {
        assert.equal(
          colored.filter((c) => c.kind === 'action' && c.value === a).length,
          2,
          `${color} ${a} should appear twice`,
        );
      }
    }
    assert.equal(deck.filter((c) => c.kind === 'wild' && c.value === 'wild').length, 4);
    assert.equal(deck.filter((c) => c.kind === 'wild' && c.value === 'wild_draw_four').length, 4);
  });
});

describe('createGame', () => {
  it('rejects fewer than 2 or more than 4 players', () => {
    assert.throws(() => createGame({
      id: 'x', mode: 'ai', players: [{ id: 'a', address: 'a', chain: 'base' }],
    }));
    assert.throws(() => createGame({
      id: 'x', mode: 'ai', players: Array.from({ length: 5 }, (_, i) => ({
        id: `p${i}`, address: `${i}`, chain: 'base' as const,
      })),
    }));
  });

  it('deals 7 cards to each player and starts with a non-WD4 card', () => {
    const g = basicGame(3);
    for (const p of g.players) assert.equal(p.hand.length, 7);
    assert.equal(g.discardPile.length, 1);
    const top = g.discardPile[0]!;
    assert.ok(!(top.kind === 'wild' && top.value === 'wild_draw_four'));
  });
});

describe('playCard', () => {
  it('rejects play when it is not your turn', () => {
    const g = basicGame(2);
    const notTurn = g.players[1]!;
    const card = notTurn.hand[0]!;
    assert.throws(() => playCard(g, notTurn.id, card.id), /NOT_YOUR_TURN/);
  });

  it('rejects play of card not in hand', () => {
    const g = basicGame(2);
    const cur = g.players[g.currentPlayerIndex]!;
    assert.throws(() => playCard(g, cur.id, 'nonexistent'), /CARD_NOT_IN_HAND/);
  });

  it('forces the player to declare a color when playing a Wild', () => {
    const g = basicGame(2);
    const cur = g.players[g.currentPlayerIndex]!;
    const wild: Card = { id: 'fake_wild', kind: 'wild', color: 'wild', value: 'wild' };
    cur.hand.push(wild);
    assert.throws(() => playCard(g, cur.id, wild.id), /COLOR_REQUIRED/);
  });

  it('applies the chosen color when a Wild is played', () => {
    const g = basicGame(2);
    const cur = g.players[g.currentPlayerIndex]!;
    const wild: Card = { id: 'fake_wild', kind: 'wild', color: 'wild', value: 'wild' };
    cur.hand.push(wild);
    playCard(g, cur.id, wild.id, 'green');
    assert.equal(g.currentColor, 'green');
  });

  it('Skip card: skips the next player', () => {
    const g = basicGame(3);
    g.currentPlayerIndex = 0;
    g.direction = 1;
    const cur = g.players[g.currentPlayerIndex]!;
    // Force a matching skip card on top.
    g.discardPile = [{ id: 'top', kind: 'number', color: 'red', value: 5 }];
    g.currentColor = 'red';
    const skip: Card = { id: 'skip1', kind: 'action', color: 'red', value: 'skip' };
    cur.hand = [skip, ...cur.hand.slice(0, 6)];
    const before = g.currentPlayerIndex;
    playCard(g, cur.id, skip.id);
    // After skip: turn should be 2 ahead of original (in 3p, that's index (before+2) % 3).
    assert.equal(g.currentPlayerIndex, (before + 2) % 3);
  });

  it('Reverse with 2 players acts as Skip — same player plays again', () => {
    const g = basicGame(2);
    g.currentPlayerIndex = 0;
    g.direction = 1;
    const cur = g.players[g.currentPlayerIndex]!;
    g.discardPile = [{ id: 'top', kind: 'number', color: 'red', value: 5 }];
    g.currentColor = 'red';
    const rev: Card = { id: 'rev1', kind: 'action', color: 'red', value: 'reverse' };
    cur.hand = [rev, ...cur.hand.slice(0, 6)];
    const before = g.currentPlayerIndex;
    playCard(g, cur.id, rev.id);
    assert.equal(g.currentPlayerIndex, before);
  });

  it('Reverse with 3 players reverses direction', () => {
    const g = basicGame(3);
    g.currentPlayerIndex = 0;
    g.direction = 1;
    const cur = g.players[g.currentPlayerIndex]!;
    g.discardPile = [{ id: 'top', kind: 'number', color: 'red', value: 5 }];
    g.currentColor = 'red';
    const rev: Card = { id: 'rev1', kind: 'action', color: 'red', value: 'reverse' };
    cur.hand = [rev, ...cur.hand.slice(0, 6)];
    playCard(g, cur.id, rev.id);
    assert.equal(g.direction, -1);
  });

  it('Draw Two: target draws 2 and is skipped', () => {
    const g = basicGame(3);
    g.currentPlayerIndex = 0;
    g.direction = 1;
    const cur = g.players[g.currentPlayerIndex]!;
    const targetIdx = (g.currentPlayerIndex + 1) % 3;
    const target = g.players[targetIdx]!;
    const targetBefore = target.hand.length;
    g.discardPile = [{ id: 'top', kind: 'number', color: 'red', value: 5 }];
    g.currentColor = 'red';
    const d2: Card = { id: 'd2', kind: 'action', color: 'red', value: 'draw_two' };
    cur.hand = [d2, ...cur.hand.slice(0, 6)];
    playCard(g, cur.id, d2.id);
    assert.equal(target.hand.length, targetBefore + 2);
    // Turn should be at the player after target.
    assert.equal(g.currentPlayerIndex, (targetIdx + 1) % 3);
  });

  it('Wild Draw Four registers a pending challenge and does not advance turn yet', () => {
    const g = basicGame(3);
    g.currentPlayerIndex = 0;
    g.direction = 1;
    const cur = g.players[g.currentPlayerIndex]!;
    g.discardPile = [{ id: 'top', kind: 'number', color: 'red', value: 5 }];
    g.currentColor = 'red';
    // Remove all red from current player to make WD4 LEGAL.
    cur.hand = cur.hand.filter((c) => c.color !== 'red');
    const wd4: Card = { id: 'wd4', kind: 'wild', color: 'wild', value: 'wild_draw_four' };
    cur.hand.push(wd4);
    const beforeTurn = g.currentPlayerIndex;
    playCard(g, cur.id, wd4.id, 'blue');
    assert.ok(g.pendingChallenge);
    assert.equal(g.currentPlayerIndex, beforeTurn);
  });
});

describe('Wild Draw Four challenge', () => {
  it('illegal WD4: challenged player draws 4, challenger keeps clean turn', () => {
    const g = basicGame(2);
    const challenger = g.players[1]!;
    const challenged = g.players[0]!;
    // Force state: top is red, challenged keeps a red card -> WD4 illegal.
    g.discardPile = [{ id: 'top', kind: 'number', color: 'red', value: 5 }];
    g.currentColor = 'red';
    challenged.hand = [
      { id: 'r3', kind: 'number', color: 'red', value: 3 },
      { id: 'b1', kind: 'number', color: 'blue', value: 1 },
    ];
    const wd4: Card = { id: 'wd4', kind: 'wild', color: 'wild', value: 'wild_draw_four' };
    challenged.hand.push(wd4);
    challenged.cardCount = challenged.hand.length;
    g.currentPlayerIndex = 0;

    playCard(g, challenged.id, wd4.id, 'blue');
    assert.ok(g.pendingChallenge);

    const challengedHandBefore = challenged.hand.length;
    challengeWildDrawFour(g, challenger.id);

    // Challenged drew 4, challenger drew 0.
    assert.equal(challenged.hand.length, challengedHandBefore + 4);
    assert.equal(g.currentPlayerIndex, 1); // challenger plays
  });

  it('legal WD4: challenger draws 6 and is skipped', () => {
    const g = basicGame(2);
    const challenger = g.players[1]!;
    const challenged = g.players[0]!;
    g.discardPile = [{ id: 'top', kind: 'number', color: 'red', value: 5 }];
    g.currentColor = 'red';
    // Challenged has no red.
    challenged.hand = [
      { id: 'b1', kind: 'number', color: 'blue', value: 1 },
      { id: 'g2', kind: 'number', color: 'green', value: 2 },
    ];
    const wd4: Card = { id: 'wd4', kind: 'wild', color: 'wild', value: 'wild_draw_four' };
    challenged.hand.push(wd4);
    challenged.cardCount = challenged.hand.length;
    g.currentPlayerIndex = 0;

    playCard(g, challenged.id, wd4.id, 'blue');
    const before = challenger.hand.length;
    challengeWildDrawFour(g, challenger.id);
    assert.equal(challenger.hand.length, before + 6);
    assert.equal(g.currentPlayerIndex, 0); // challenger was skipped, back to challenged
  });

  it('accepting WD4: target draws 4 and is skipped', () => {
    const g = basicGame(2);
    const target = g.players[1]!;
    const cur = g.players[0]!;
    g.discardPile = [{ id: 'top', kind: 'number', color: 'red', value: 5 }];
    g.currentColor = 'red';
    cur.hand = [{ id: 'b1', kind: 'number', color: 'blue', value: 1 }];
    const wd4: Card = { id: 'wd4', kind: 'wild', color: 'wild', value: 'wild_draw_four' };
    cur.hand.push(wd4);
    cur.cardCount = cur.hand.length;
    g.currentPlayerIndex = 0;

    playCard(g, cur.id, wd4.id, 'blue');
    const targetBefore = target.hand.length;
    acceptWildDrawFour(g, target.id);
    assert.equal(target.hand.length, targetBefore + 4);
    assert.equal(g.currentPlayerIndex, 0); // back to original after skip
  });
});

describe('UNO call / catch', () => {
  it('player can call UNO when they have one card', () => {
    const g = basicGame(2);
    g.players[0]!.hand = [{ id: 'r2', kind: 'number', color: 'red', value: 2 }];
    g.players[0]!.cardCount = 1;
    callUno(g, g.players[0]!.id);
    assert.equal(g.players[0]!.calledUno, true);
  });

  it('player cannot call UNO when they have multiple cards', () => {
    const g = basicGame(2);
    assert.throws(() => callUno(g, g.players[0]!.id), /NOT_AT_ONE/);
  });

  it('catching a player who forgot UNO adds 2 penalty cards', () => {
    const g = basicGame(2);
    const target = g.players[1]!;
    target.hand = [{ id: 'r2', kind: 'number', color: 'red', value: 2 }];
    target.cardCount = 1;
    target.calledUno = false;
    const before = target.hand.length;
    catchUno(g, g.players[0]!.id, target.id);
    assert.equal(target.hand.length, before + 2);
  });

  it('cannot catch a player who already called UNO', () => {
    const g = basicGame(2);
    const target = g.players[1]!;
    target.hand = [{ id: 'r2', kind: 'number', color: 'red', value: 2 }];
    target.cardCount = 1;
    target.calledUno = true;
    assert.throws(() => catchUno(g, g.players[0]!.id, target.id), /CATCH_INVALID/);
  });
});

describe('drawing', () => {
  it('drawCard adds one card to the player hand', () => {
    const g = basicGame(2);
    const cur = g.players[g.currentPlayerIndex]!;
    const before = cur.hand.length;
    drawCard(g, cur.id);
    assert.equal(cur.hand.length, before + 1);
  });

  it('drawCard rejects if it is not your turn', () => {
    const g = basicGame(2);
    const other = g.players[(g.currentPlayerIndex + 1) % 2]!;
    assert.throws(() => drawCard(g, other.id), /NOT_YOUR_TURN/);
  });
});

describe('winning & scoring', () => {
  it('playing the last card wins the game', () => {
    const g = basicGame(2);
    const cur = g.players[g.currentPlayerIndex]!;
    g.discardPile = [{ id: 'top', kind: 'number', color: 'red', value: 5 }];
    g.currentColor = 'red';
    cur.hand = [{ id: 'r1', kind: 'number', color: 'red', value: 1 }];
    cur.cardCount = 1;
    const result = playCard(g, cur.id, 'r1');
    assert.equal(result.gameOver, true);
    assert.equal(result.winnerId, cur.id);
    assert.equal(g.status, 'finished');
  });

  it('scoreForWinner sums opponent card points correctly', () => {
    const g = basicGame(2);
    const winner = g.players[0]!;
    const loser = g.players[1]!;
    winner.hand = [];
    loser.hand = [
      { id: 'r3', kind: 'number', color: 'red', value: 3 },
      { id: 'g_skip', kind: 'action', color: 'green', value: 'skip' },
      { id: 'wild', kind: 'wild', color: 'wild', value: 'wild' },
    ];
    assert.equal(scoreForWinner(g, winner.id), 3 + 20 + 50);
  });
});
