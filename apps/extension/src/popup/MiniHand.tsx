import { useState } from 'react';
import type { Card, ClientGameState, Color } from '@uno/shared';
import { canPlayCard } from '@uno/shared';

interface Props {
  game: ClientGameState;
  onPlay: (cardId: string, chosenColor?: Color) => void;
  onDraw: () => void;
  onCallUno: () => void;
}

const COLOR_BG: Record<string, string> = {
  red: '#FF4444',
  blue: '#2196F3',
  green: '#4CAF50',
  yellow: '#FFC107',
  wild: 'linear-gradient(135deg,#FF4444,#FFC107,#4CAF50,#2196F3)',
};

export function MiniHand({ game, onPlay, onDraw, onCallUno }: Props) {
  const [pendingWild, setPendingWild] = useState<Card | null>(null);

  function tryPlay(card: Card) {
    if (card.kind === 'wild') {
      setPendingWild(card);
      return;
    }
    onPlay(card.id);
  }

  return (
    <div style={{ borderTop: '1px solid #222', padding: 8 }}>
      <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 4 }}>
        {game.selfHand.map((card) => {
          const playable = !game.topDiscard || canPlayCard(card, game.topDiscard, game.currentColor).legal;
          return (
            <button
              key={card.id}
              onClick={() => playable && tryPlay(card)}
              disabled={!playable}
              style={{
                minWidth: 44, height: 64, borderRadius: 6, border: 'none', cursor: playable ? 'pointer' : 'default',
                background: card.kind === 'wild' ? COLOR_BG.wild : COLOR_BG[card.color],
                color: '#fff', fontFamily: 'Baloo 2, sans-serif', fontWeight: 800, fontSize: 18,
                opacity: playable ? 1 : 0.4,
              }}
            >
              {labelOf(card)}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <button onClick={onDraw} style={btnGhost}>Draw</button>
        <button onClick={onCallUno} style={{ ...btnGhost, color: '#FF4444' }}>UNO!</button>
      </div>

      {pendingWild && (
        <div style={pickerOverlay}>
          <div style={{ background: '#0a0a0a', padding: 12, borderRadius: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Pick a color</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['red', 'blue', 'green', 'yellow'] as Color[]).map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    onPlay(pendingWild.id, c);
                    setPendingWild(null);
                  }}
                  style={{ width: 50, height: 50, borderRadius: 8, background: COLOR_BG[c], border: 'none' }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const btnGhost: React.CSSProperties = {
  flex: 1,
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.2)',
  color: '#fff',
  borderRadius: 999,
  padding: '8px 12px',
  cursor: 'pointer',
};

const pickerOverlay: React.CSSProperties = {
  position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

function labelOf(c: Card): string {
  if (c.kind === 'number') return String(c.value);
  if (c.kind === 'action') return c.value === 'skip' ? '⊘' : c.value === 'reverse' ? '⇄' : '+2';
  return c.value === 'wild_draw_four' ? '+4' : 'W';
}
