import { createWalletClient, http, encodeAbiParameters, keccak256, toHex, type Chain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mainnet, arbitrum, optimism, base, polygon, avalanche, bsc } from 'viem/chains';
import type { EVMChain } from '@uno/shared';
import { CHAIN_INFO } from '@uno/shared';

const CHAIN_BY_ID: Record<EVMChain, Chain> = {
  ethereum: mainnet,
  arbitrum,
  optimism,
  base,
  polygon,
  avalanche,
  bnb: bsc,
};

const ESCROW_ABI = [
  {
    inputs: [
      { name: 'gameId', type: 'bytes32' },
      { name: 'winner', type: 'address' },
      { name: 'serverSignature', type: 'bytes' },
    ],
    name: 'settleGame',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

/**
 * Build the message hash that the contract expects:
 *   keccak256(abi.encodePacked(gameId, winner))
 * then prefixed with the Ethereum signed-message envelope.
 */
export function escrowMessageHash(gameId: `0x${string}`, winner: `0x${string}`): `0x${string}` {
  const inner = keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'address' }], [gameId, winner]));
  return inner;
}

/**
 * Settle a game by submitting a server-signed payload to the escrow contract.
 *
 * Real usage: import the SETTLEMENT_PRIVATE_KEY from env (NEVER hardcoded). For
 * production, this should run inside a worker process that pulls jobs from a queue,
 * so a single transaction failure doesn't block other settlements.
 */
export async function settleEvmGame(opts: {
  chain: EVMChain;
  gameId: `0x${string}`;
  winner: `0x${string}`;
  signature: `0x${string}`;
}): Promise<`0x${string}`> {
  const chain = CHAIN_BY_ID[opts.chain];
  const info = CHAIN_INFO[opts.chain];
  if (!info.escrowAddress) {
    throw new Error(`No escrow address configured for ${opts.chain}`);
  }

  const pk = process.env.SETTLEMENT_PRIVATE_KEY;
  if (!pk || !pk.startsWith('0x')) {
    throw new Error('SETTLEMENT_PRIVATE_KEY env var required');
  }
  const account = privateKeyToAccount(pk as `0x${string}`);
  const client = createWalletClient({
    account,
    chain,
    transport: http(info.rpcUrl),
  });

  const txHash = await client.writeContract({
    address: info.escrowAddress as `0x${string}`,
    abi: ESCROW_ABI,
    functionName: 'settleGame',
    args: [opts.gameId, opts.winner, opts.signature],
  });
  return txHash;
}

export function gameIdToBytes32(id: string): `0x${string}` {
  return keccak256(toHex(id));
}
