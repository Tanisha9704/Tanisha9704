import { useGameState } from '../../hooks/useGameState';
import { getSocket } from '../../hooks/useGameSocket';
import { useMultiWallet } from '../../hooks/useMultiWallet';

interface Props {
  lobbyId: string;
}

export function LobbyWaiting({ lobbyId }: Props) {
  const { currentLobby, setRoute } = useGameState();
  const { address } = useMultiWallet();

  const lobby = currentLobby?.id === lobbyId ? currentLobby : null;

  function leave() {
    getSocket()?.emit('lobby:leave', { lobbyId });
    setRoute({ name: 'lobby_browser' });
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center pt-20">
      <div className="glass w-full max-w-md rounded-2xl p-8 text-center">
        <h2 className="mb-1 font-display text-3xl font-extrabold">Waiting for players…</h2>
        <p className="text-white/60 mb-6">
          {lobby?.players.length ?? 0} / {lobby?.maxPlayers ?? '?'} seats filled
        </p>
        <ul className="space-y-2 text-left">
          {lobby?.players.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3">
              <span className="font-mono">
                {shorten(p.address)} {p.address === address && <span className="text-accent">(you)</span>}
              </span>
              <span className={p.ready ? 'text-accent' : 'text-white/40'}>
                {p.ready ? '✓ ready' : 'waiting'}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex gap-2">
          <button onClick={leave} className="btn-ghost flex-1">
            Leave (refund)
          </button>
        </div>
        <p className="mt-4 text-xs text-white/40">
          Share: <span className="font-mono">{location.origin}/lobby/{lobbyId}</span>
        </p>
      </div>
    </div>
  );
}

function shorten(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
