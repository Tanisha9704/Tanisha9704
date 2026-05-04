import { useEffect, useState } from 'react';
import { useGameState } from '../../hooks/useGameState';

interface Props {
  onCallUno: () => void;
}

export function GameHUD({ onCallUno }: Props) {
  const { game } = useGameState();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  if (!game) return null;
  const current = game.players[game.currentPlayerIndex];
  const elapsed = now - game.turnStartedAt;
  const timeLeft = Math.max(0, game.turnTimeLimit - elapsed);
  const pct = (timeLeft / game.turnTimeLimit) * 100;

  return (
    <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2">
      <div className="glass rounded-full px-5 py-2 text-sm font-medium">
        Turn:{' '}
        <span className="text-accent font-bold">
          {current?.username ?? shorten(current?.address ?? '')}
        </span>
        <span className="ml-2 text-white/60">· {(timeLeft / 1000).toFixed(0)}s</span>
      </div>
      <div className="h-1 w-48 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <button
        onClick={onCallUno}
        className="mt-2 rounded-full bg-card-red px-6 py-2 text-lg font-extrabold tracking-wider text-white shadow-lg hover:scale-105 transition-transform"
      >
        UNO!
      </button>
    </div>
  );
}

function shorten(a: string): string {
  if (!a) return '';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
