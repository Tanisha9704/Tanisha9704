import { useState } from 'react';
import { parseEther } from 'viem';
import toast from 'react-hot-toast';
import { useGameState } from '../../hooks/useGameState';
import { getSocket } from '../../hooks/useGameSocket';
import { useMultiWallet } from '../../hooks/useMultiWallet';
import { useEscrowDeposit } from '../../hooks/useEscrow';
import { CHAIN_INFO, EVM_CHAINS } from '@uno/shared';

const PRESETS = [5, 10, 25, 50, 100];

export function LobbyCreate() {
  const { setRoute } = useGameState();
  const { chain } = useMultiWallet();
  const { deposit } = useEscrowDeposit();
  const [maxPlayers, setMaxPlayers] = useState<2 | 3 | 4>(4);
  const [buyInUsd, setBuyInUsd] = useState<number>(10);
  const [turnTimer, setTurnTimer] = useState<number>(30_000);
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [isCreating, setIsCreating] = useState(false);

  if (!chain) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="glass rounded-2xl p-8">Connect a wallet first.</div>
      </div>
    );
  }

  async function create() {
    if (!chain) return;
    setIsCreating(true);
    try {
      // For demo purposes, treat USD as ETH-equivalent at 1:0.0003 rate.
      const buyInWei = parseEther((buyInUsd * 0.0003).toString()).toString();

      const socket = getSocket();
      if (!socket) throw new Error('socket disconnected');

      // Step 1: deposit on-chain (creates the on-chain escrow game).
      const txHash = await deposit({ lobbyId: 'pending', buyIn: buyInWei });
      void txHash;

      // Step 2: create the lobby record on the server.
      socket.emit(
        'lobby:create',
        {
          maxPlayers,
          buyIn: buyInWei,
          chain,
          turnTimeLimit: turnTimer,
          visibility,
        },
        (resp) => {
          setIsCreating(false);
          if (!resp.ok) return toast.error(resp.error);
          setRoute({ name: 'lobby_waiting', lobbyId: resp.data.lobby.id });
        },
      );
    } catch (e) {
      setIsCreating(false);
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center pt-20">
      <div className="glass w-full max-w-md rounded-2xl p-8">
        <h2 className="mb-6 font-display text-3xl font-extrabold">Create Lobby</h2>

        <Field label="Players">
          <div className="flex gap-2">
            {[2, 3, 4].map((n) => (
              <button
                key={n}
                onClick={() => setMaxPlayers(n as 2 | 3 | 4)}
                className={`flex-1 rounded-xl py-2 ${maxPlayers === n ? 'bg-accent text-bg font-bold' : 'bg-white/10'}`}
              >
                {n}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Buy-in (USD)">
          <div className="flex gap-2 flex-wrap">
            {PRESETS.map((v) => (
              <button
                key={v}
                onClick={() => setBuyInUsd(v)}
                className={`px-4 py-2 rounded-xl ${buyInUsd === v ? 'bg-accent text-bg font-bold' : 'bg-white/10'}`}
              >
                ${v}
              </button>
            ))}
          </div>
          <div className="mt-2 text-sm text-white/60">
            On {CHAIN_INFO[chain].displayName} · 1.5% platform fee on prize pool
          </div>
        </Field>

        <Field label="Turn timer">
          <select
            value={turnTimer}
            onChange={(e) => setTurnTimer(Number(e.target.value))}
            className="w-full rounded-xl bg-white/10 px-3 py-2"
          >
            <option value={15_000}>15 seconds</option>
            <option value={30_000}>30 seconds</option>
            <option value={45_000}>45 seconds</option>
            <option value={60_000}>60 seconds</option>
          </select>
        </Field>

        <Field label="Visibility">
          <div className="flex gap-2">
            {(['public', 'private'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setVisibility(v)}
                className={`flex-1 rounded-xl py-2 capitalize ${visibility === v ? 'bg-accent text-bg font-bold' : 'bg-white/10'}`}
              >
                {v}
              </button>
            ))}
          </div>
        </Field>

        {!EVM_CHAINS.includes(chain as never) && (
          <div className="mb-3 rounded-xl bg-yellow-500/20 p-3 text-sm">
            Non-EVM lobbies require the Solana / Aptos adapter (see useEscrow stub).
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={() => setRoute({ name: 'menu' })} className="btn-ghost flex-1">
            Cancel
          </button>
          <button
            onClick={create}
            disabled={isCreating}
            className="btn-primary flex-1"
          >
            {isCreating ? 'Creating...' : 'Create lobby'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-2 text-sm text-white/60">{label}</div>
      {children}
    </div>
  );
}
