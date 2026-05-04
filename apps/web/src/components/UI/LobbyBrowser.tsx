import { useGameState } from '../../hooks/useGameState';
import { getSocket } from '../../hooks/useGameSocket';
import { CHAIN_INFO } from '@uno/shared';
import { useEscrowDeposit } from '../../hooks/useEscrow';
import toast from 'react-hot-toast';

export function LobbyBrowser() {
  const { lobbies, setRoute } = useGameState();
  const { deposit } = useEscrowDeposit();

  async function joinLobby(lobbyId: string, buyIn: string) {
    try {
      const txHash = await deposit({ lobbyId, buyIn });
      getSocket()?.emit('lobby:join', { lobbyId, depositTxHash: txHash }, (resp) => {
        if (!resp.ok) return toast.error(resp.error);
        setRoute({ name: 'lobby_waiting', lobbyId });
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center pt-20">
      <div className="glass w-full max-w-3xl rounded-2xl p-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-display text-3xl font-extrabold">Open Lobbies</h2>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => setRoute({ name: 'lobby_create' })}>
              + Create
            </button>
            <button className="btn-ghost" onClick={() => setRoute({ name: 'menu' })}>
              Back
            </button>
          </div>
        </div>
        {lobbies.length === 0 && (
          <p className="text-center text-white/60 py-12">No open lobbies. Be the first to create one.</p>
        )}
        <ul className="space-y-2">
          {lobbies.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3"
            >
              <div>
                <div className="font-bold">{shorten(l.hostAddress)}'s table</div>
                <div className="text-sm text-white/60">
                  {CHAIN_INFO[l.chain].displayName} · {l.maxPlayers} players ·{' '}
                  {formatBuyIn(l.buyIn, l.chain)} buy-in
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-white/60">
                  {l.players.length}/{l.maxPlayers}
                </span>
                <button className="btn-primary" onClick={() => joinLobby(l.id, l.buyIn)}>
                  Join
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function shorten(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function formatBuyIn(wei: string, chain: keyof typeof CHAIN_INFO): string {
  const sym = CHAIN_INFO[chain].nativeSymbol;
  try {
    const eth = Number(BigInt(wei)) / 1e18;
    return `${eth.toFixed(eth < 0.01 ? 6 : 4)} ${sym}`;
  } catch {
    return `${wei} ${sym}`;
  }
}
