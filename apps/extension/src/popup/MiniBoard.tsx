import type { ClientGameState } from '@uno/shared';

const COLOR_BG: Record<string, string> = {
  red: '#FF4444',
  blue: '#2196F3',
  green: '#4CAF50',
  yellow: '#FFC107',
  wild: '#1c1c1c',
};

export function MiniBoard({ game }: { game: ClientGameState }) {
  const top = game.topDiscard;
  return (
    <div style={{ flex: 1, padding: 12, overflowY: 'auto' }}>
      <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 6 }}>Players</div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {game.players.map((p, i) => (
          <li
            key={p.id}
            style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '6px 10px', borderRadius: 8,
              background: i === game.currentPlayerIndex ? 'rgba(0,255,136,0.15)' : 'rgba(255,255,255,0.05)',
            }}
          >
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
              {p.username ?? `${p.address.slice(0, 6)}…${p.address.slice(-4)}`}
            </span>
            <span style={{ fontSize: 12, opacity: 0.7 }}>{p.cardCount} cards</span>
          </li>
        ))}
      </ul>

      <div style={{ marginTop: 12, fontSize: 12, opacity: 0.6 }}>Top discard</div>
      {top ? (
        <div
          style={{
            marginTop: 6,
            background: top.kind === 'wild' ? COLOR_BG[game.currentColor] : COLOR_BG[top.color],
            height: 80,
            borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Baloo 2, sans-serif', fontSize: 32, color: '#fff',
          }}
        >
          {labelOf(top)}
        </div>
      ) : null}

      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.5 }}>
        Draw pile: {game.drawPileCount} ·{' '}
        {game.direction === 1 ? '↻' : '↺'}
      </div>
    </div>
  );
}

function labelOf(c: ClientGameState['topDiscard']) {
  if (!c) return '';
  if (c.kind === 'number') return c.value;
  if (c.kind === 'action') return c.value === 'skip' ? '⊘' : c.value === 'reverse' ? '⇄' : '+2';
  return c.value === 'wild_draw_four' ? '+4' : '★';
}
