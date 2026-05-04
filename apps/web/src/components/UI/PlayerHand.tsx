import { useGameState } from '../../hooks/useGameState';
import type { Card } from '@uno/shared';
import { canPlayCard } from '@uno/shared';

interface Props {
  onPlayCard: (card: Card) => void;
}

const COLOR_BG: Record<string, string> = {
  red: '#FF4444',
  blue: '#2196F3',
  green: '#4CAF50',
  yellow: '#FFC107',
  wild: 'linear-gradient(135deg,#FF4444 0%,#FFC107 33%,#4CAF50 66%,#2196F3 100%)',
};

export function PlayerHand({ onPlayCard }: Props) {
  const { game } = useGameState();
  if (!game) return null;

  const isMyTurn = game.players[game.currentPlayerIndex]?.id === 'me' ||
    (game.mode === 'pvp' && game.players[game.currentPlayerIndex]?.id === game.players.find(() => true)?.id);

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 flex justify-center pb-4">
      <div className="flex gap-1 px-4 py-2 max-w-full overflow-x-auto">
        {game.selfHand.map((card) => {
          const playable =
            !game.topDiscard || canPlayCard(card, game.topDiscard, game.currentColor).legal;
          return (
            <button
              key={card.id}
              onClick={() => isMyTurn && playable && onPlayCard(card)}
              disabled={!isMyTurn || !playable}
              className="card-shadow relative h-32 w-20 rounded-xl text-white font-card text-2xl font-bold transition-transform hover:-translate-y-2 disabled:opacity-50"
              style={{
                background:
                  card.kind === 'wild' ? COLOR_BG.wild : COLOR_BG[card.color],
              }}
              title={cardTitle(card)}
            >
              <span className="absolute top-1 left-2 text-sm">{cardCornerLabel(card)}</span>
              <span className="block leading-[8rem]">{cardCenterLabel(card)}</span>
              <span className="absolute bottom-1 right-2 text-sm">{cardCornerLabel(card)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function cardTitle(c: Card): string {
  if (c.kind === 'number') return `${c.color} ${c.value}`;
  if (c.kind === 'action') return `${c.color} ${c.value.replace('_', ' ')}`;
  return c.value === 'wild_draw_four' ? 'Wild Draw Four' : 'Wild';
}

function cardCornerLabel(c: Card): string {
  if (c.kind === 'number') return String(c.value);
  if (c.kind === 'action') return c.value === 'skip' ? 'S' : c.value === 'reverse' ? 'R' : '+2';
  return c.value === 'wild_draw_four' ? '+4' : 'W';
}

function cardCenterLabel(c: Card): string {
  if (c.kind === 'number') return String(c.value);
  if (c.kind === 'action') return c.value === 'skip' ? '⊘' : c.value === 'reverse' ? '⇄' : '+2';
  return c.value === 'wild_draw_four' ? '+4' : '★';
}
