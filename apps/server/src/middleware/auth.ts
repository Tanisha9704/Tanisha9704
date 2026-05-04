import jwt from 'jsonwebtoken';
import type { ChainType, SupportedChain } from '@uno/shared';
import { recoverMessageAddress } from 'viem';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-only-secret-change-me';
const TOKEN_TTL = '24h';

export interface AuthPayload {
  address: string;
  chain: SupportedChain;
  chainType: ChainType;
  iat?: number;
  exp?: number;
}

export function signToken(payload: Omit<AuthPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    return null;
  }
}

export function buildSignInMessage(address: string, nonce: string): string {
  return `Sign in to UNO ONCHAIN\nAddress: ${address}\nNonce: ${nonce}\nTimestamp: ${Date.now()}`;
}

/**
 * Verify an EVM signature against a claimed address and the original message.
 * Solana / Aptos verification lives in their respective adapters.
 */
export async function verifyEvmSignature(
  message: string,
  signature: `0x${string}`,
  claimedAddress: string,
): Promise<boolean> {
  try {
    const recovered = await recoverMessageAddress({ message, signature });
    return recovered.toLowerCase() === claimedAddress.toLowerCase();
  } catch {
    return false;
  }
}
