import type { ChainInfo, SupportedChain } from './types';

export const PLATFORM_FEE_BPS = 150; // 1.5%
export const BPS_DENOMINATOR = 10_000;

export const DEFAULT_TURN_TIMER_MS = 30_000;
export const TURN_GRACE_MS = 2_000;
export const RECONNECT_GRACE_MS = 60_000;
export const WD4_CHALLENGE_WINDOW_MS = 5_000;
export const UNO_CATCH_WINDOW_MS = 3_000;

export const STARTING_HAND_SIZE = 7;
export const TOTAL_DECK_SIZE = 108;

export const CARD_POINTS = {
  number: (v: number) => v,
  action: 20,
  wild: 50,
} as const;

export const COLORS = ['red', 'yellow', 'green', 'blue'] as const;

export const CHAIN_INFO: Record<SupportedChain, ChainInfo> = {
  ethereum: {
    id: 'ethereum',
    type: 'evm',
    displayName: 'Ethereum',
    nativeSymbol: 'ETH',
    chainId: 1,
    rpcUrl: 'https://eth.llamarpc.com',
    explorerUrl: 'https://etherscan.io',
  },
  arbitrum: {
    id: 'arbitrum',
    type: 'evm',
    displayName: 'Arbitrum One',
    nativeSymbol: 'ETH',
    chainId: 42161,
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    explorerUrl: 'https://arbiscan.io',
  },
  optimism: {
    id: 'optimism',
    type: 'evm',
    displayName: 'OP Mainnet',
    nativeSymbol: 'ETH',
    chainId: 10,
    rpcUrl: 'https://mainnet.optimism.io',
    explorerUrl: 'https://optimistic.etherscan.io',
  },
  base: {
    id: 'base',
    type: 'evm',
    displayName: 'Base',
    nativeSymbol: 'ETH',
    chainId: 8453,
    rpcUrl: 'https://mainnet.base.org',
    explorerUrl: 'https://basescan.org',
  },
  polygon: {
    id: 'polygon',
    type: 'evm',
    displayName: 'Polygon',
    nativeSymbol: 'MATIC',
    chainId: 137,
    rpcUrl: 'https://polygon-rpc.com',
    explorerUrl: 'https://polygonscan.com',
  },
  avalanche: {
    id: 'avalanche',
    type: 'evm',
    displayName: 'Avalanche C-Chain',
    nativeSymbol: 'AVAX',
    chainId: 43114,
    rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
    explorerUrl: 'https://snowtrace.io',
  },
  bnb: {
    id: 'bnb',
    type: 'evm',
    displayName: 'BNB Chain',
    nativeSymbol: 'BNB',
    chainId: 56,
    rpcUrl: 'https://bsc-dataseed.binance.org',
    explorerUrl: 'https://bscscan.com',
  },
  solana: {
    id: 'solana',
    type: 'solana',
    displayName: 'Solana',
    nativeSymbol: 'SOL',
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    explorerUrl: 'https://solscan.io',
  },
  aptos: {
    id: 'aptos',
    type: 'aptos',
    displayName: 'Aptos',
    nativeSymbol: 'APT',
    rpcUrl: 'https://fullnode.mainnet.aptoslabs.com/v1',
    explorerUrl: 'https://explorer.aptoslabs.com',
  },
};

export const ALL_CHAINS: SupportedChain[] = Object.keys(CHAIN_INFO) as SupportedChain[];
export const EVM_CHAINS = ALL_CHAINS.filter((c) => CHAIN_INFO[c].type === 'evm');

export function calculateFee(totalPool: bigint): { fee: bigint; payout: bigint } {
  const fee = (totalPool * BigInt(PLATFORM_FEE_BPS)) / BigInt(BPS_DENOMINATOR);
  return { fee, payout: totalPool - fee };
}
