import { useGameState } from '../../hooks/useGameState';

export function GameOverModal() {
  const { gameOver, setGameOver, setRoute, game } = useGameState();
  if (!gameOver) return null;

  const winner = game?.players.find((p) => p.id === gameOver.winnerId);
  const youWon = winner?.id === 'me' || winner?.address === game?.players[0]?.address;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="glass rounded-3xl p-12 text-center min-w-[420px]">
        <div className="mb-2 text-sm uppercase tracking-widest text-white/50">Round complete</div>
        <h2 className="font-display text-5xl font-extrabold">
          {youWon ? '🏆 You won!' : 'You lost'}
        </h2>
        <p className="mt-3 text-white/70">
          Winner: {winner?.username ?? shorten(winner?.address ?? '')}
        </p>
        {gameOver.payoutTxHash && (
          <a
            href={`https://etherscan.io/tx/${gameOver.payoutTxHash}`}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-block text-accent underline"
          >
            View settlement transaction →
          </a>
        )}
        <div className="mt-8 flex justify-center gap-3">
          <button
            className="btn-primary"
            onClick={() => {
              setGameOver(null);
              setRoute({ name: 'menu' });
            }}
          >
            Back to menu
          </button>
        </div>
      </div>
    </div>
  );
}

function shorten(a: string): string {
  if (!a) return '';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
