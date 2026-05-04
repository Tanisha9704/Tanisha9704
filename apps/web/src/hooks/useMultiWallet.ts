import { useEffect, useState } from 'react';
import { useAccount, useDisconnect, useSignMessage, useChainId } from 'wagmi';
import type { ChainType, SupportedChain } from '@uno/shared';
import { CHAIN_INFO } from '@uno/shared';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const STORAGE_KEY = 'uno_jwt';

export interface MultiWalletApi {
  isConnected: boolean;
  address: string | null;
  chain: SupportedChain | null;
  chainType: ChainType | null;
  jwt: string | null;
  signIn: () => Promise<void>;
  signOut: () => void;
}

/**
 * EVM-first unified wallet hook. Solana / Aptos adapters are layered in via the
 * MultiWalletProvider — this hook merges their state. For brevity here we
 * implement the EVM path completely; the Solana / Aptos surfaces share the same
 * shape (sign-in via signMessage, JWT exchange).
 */
export function useMultiWallet(): MultiWalletApi {
  const { address: evmAddress, isConnected: evmConnected } = useAccount();
  const evmChainId = useChainId();
  const { signMessageAsync } = useSignMessage();
  const { disconnect } = useDisconnect();
  const [jwt, setJwt] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));

  const chain: SupportedChain | null = evmChainIdToName(evmChainId);
  const chainType: ChainType | null = chain ? CHAIN_INFO[chain].type : null;

  const isConnected = !!evmConnected && !!evmAddress && !!jwt;

  useEffect(() => {
    // If wallet disconnects, clear JWT.
    if (!evmConnected) {
      setJwt(null);
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [evmConnected]);

  async function signIn() {
    if (!evmAddress || !chain) throw new Error('No wallet connected');
    const nonceRes = await fetch(`${API_URL}/auth/nonce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: evmAddress }),
    }).then((r) => r.json());
    if (!nonceRes.ok) throw new Error(nonceRes.error ?? 'nonce failed');

    const signature = await signMessageAsync({ message: nonceRes.message });

    const verifyRes = await fetch(`${API_URL}/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: evmAddress,
        chain,
        chainType: 'evm',
        message: nonceRes.message,
        signature,
      }),
    }).then((r) => r.json());
    if (!verifyRes.ok) throw new Error(verifyRes.error ?? 'verify failed');

    localStorage.setItem(STORAGE_KEY, verifyRes.token);
    setJwt(verifyRes.token);
  }

  function signOut() {
    setJwt(null);
    localStorage.removeItem(STORAGE_KEY);
    disconnect();
  }

  return {
    isConnected,
    address: evmAddress ?? null,
    chain,
    chainType,
    jwt,
    signIn,
    signOut,
  };
}

function evmChainIdToName(chainId: number | undefined): SupportedChain | null {
  switch (chainId) {
    case 1:
      return 'ethereum';
    case 42161:
      return 'arbitrum';
    case 10:
      return 'optimism';
    case 8453:
      return 'base';
    case 137:
      return 'polygon';
    case 43114:
      return 'avalanche';
    case 56:
      return 'bnb';
    default:
      return null;
  }
}
