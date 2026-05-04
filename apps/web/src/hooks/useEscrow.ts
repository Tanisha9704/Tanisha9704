import { useWalletClient } from 'wagmi';
import { keccak256, toHex, parseAbi } from 'viem';
import { CHAIN_INFO } from '@uno/shared';
import { useMultiWallet } from './useMultiWallet';

const ESCROW_ABI = parseAbi([
  'function createGame(bytes32 gameId, uint8 maxPlayers) external payable',
  'function joinGame(bytes32 gameId) external payable',
  'function leaveBeforeStart(bytes32 gameId) external',
]);

/**
 * EVM escrow deposit. The hook returns a `deposit` function that the caller
 * invokes when joining or creating a lobby. The transaction hash is sent up
 * to the server so it can verify the on-chain state before granting a seat.
 */
export function useEscrowDeposit() {
  const { data: walletClient } = useWalletClient();
  const { chain } = useMultiWallet();

  async function deposit(args: { lobbyId: string; buyIn: string; maxPlayers?: 2 | 3 | 4 }): Promise<string> {
    if (!walletClient) throw new Error('No wallet client');
    if (!chain) throw new Error('No chain selected');
    const info = CHAIN_INFO[chain];
    if (!info.escrowAddress) {
      throw new Error(`Escrow not deployed on ${info.displayName}`);
    }
    const gameId = keccak256(toHex(args.lobbyId));
    const value = BigInt(args.buyIn);

    const hash = await walletClient.writeContract({
      address: info.escrowAddress as `0x${string}`,
      abi: ESCROW_ABI,
      functionName: args.maxPlayers ? 'createGame' : 'joinGame',
      args: args.maxPlayers ? [gameId, args.maxPlayers] : [gameId],
      value,
    });
    return hash;
  }

  return { deposit };
}
