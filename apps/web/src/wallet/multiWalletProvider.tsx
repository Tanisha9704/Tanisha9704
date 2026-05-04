import type { ReactNode } from 'react';
import { WagmiProvider, createConfig, http } from 'wagmi';
import {
  mainnet,
  arbitrum,
  optimism,
  base,
  polygon,
  avalanche,
  bsc,
} from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, getDefaultConfig, darkTheme } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';

const wagmiConfig = getDefaultConfig({
  appName: 'UNO ONCHAIN',
  projectId: import.meta.env.VITE_WC_PROJECT_ID ?? 'demo',
  chains: [mainnet, arbitrum, optimism, base, polygon, avalanche, bsc],
  transports: {
    [mainnet.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
    [base.id]: http(),
    [polygon.id]: http(),
    [avalanche.id]: http(),
    [bsc.id]: http(),
  },
  ssr: false,
});

const queryClient = new QueryClient();

/**
 * EVM is wired here via wagmi+RainbowKit. Solana and Aptos providers live in
 * @solana/wallet-adapter-react and @aptos-labs/wallet-adapter-react and would
 * wrap this same tree. For brevity we expose only the EVM tree — the
 * `useMultiWallet` hook reads from this and falls back gracefully when extra
 * providers aren't mounted.
 */
export function MultiWalletProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme({ accentColor: '#00FF88' })}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
