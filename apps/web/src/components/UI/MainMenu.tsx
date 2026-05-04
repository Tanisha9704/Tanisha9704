import { useGameState } from '../../hooks/useGameState';
import { useAiGame } from '../../hooks/useAiGame';
import { useMultiWallet } from '../../hooks/useMultiWallet';
import toast from 'react-hot-toast';

export function MainMenu() {
  const { setRoute } = useGameState();
  const { startAiGame } = useAiGame();
  const { isConnected } = useMultiWallet();

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      {/* Subtle animated gradient backdrop */}
      <div
        className="absolute inset-0 -z-10 opacity-60"
        style={{
          background:
            'radial-gradient(ellipse at top, rgba(0,255,136,0.15), transparent 60%), radial-gradient(ellipse at bottom, rgba(33,150,243,0.12), transparent 60%)',
        }}
      />
      <div className="glass rounded-3xl p-12 text-center min-w-[360px]">
        <h1 className="font-display text-5xl font-extrabold tracking-tight">
          UNO <span className="text-accent">ONCHAIN</span>
        </h1>
        <p className="mt-2 mb-8 text-white/70">3D · Multichain · Real-time</p>
        <div className="flex flex-col gap-3">
          <button
            className="btn-primary"
            onClick={() => {
              const id = startAiGame('medium');
              setRoute({ name: 'game', gameId: id, mode: 'ai' });
            }}
          >
            Play vs AI
          </button>
          <button
            className="btn-ghost"
            onClick={() => {
              if (!isConnected) return toast.error('Connect a wallet first');
              setRoute({ name: 'lobby_browser' });
            }}
          >
            Join Lobby
          </button>
          <button
            className="btn-ghost"
            onClick={() => {
              if (!isConnected) return toast.error('Connect a wallet first');
              setRoute({ name: 'lobby_create' });
            }}
          >
            Create Lobby
          </button>
        </div>
      </div>
    </div>
  );
}
