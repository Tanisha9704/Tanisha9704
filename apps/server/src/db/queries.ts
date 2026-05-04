import { query } from './connection.js';
import type { SupportedChain } from '@uno/shared';

export interface UserRow {
  id: string;
  address: string;
  chain: string;
  chain_type: string;
  username: string | null;
  games_played: number;
  games_won: number;
  total_earned: string;
  total_wagered: string;
  elo_rating: number;
}

export async function upsertUser(input: {
  address: string;
  chain: SupportedChain;
  chainType: string;
}): Promise<UserRow> {
  const rows = await query<UserRow>(
    `INSERT INTO users (address, chain, chain_type)
     VALUES ($1, $2, $3)
     ON CONFLICT (address, chain) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [input.address, input.chain, input.chainType],
  );
  return rows[0]!;
}

export async function recordGameStarted(input: {
  escrowGameId: string;
  chain: SupportedChain;
  mode: 'ai' | 'pvp';
  buyIn: string;
  maxPlayers: number;
}): Promise<string> {
  const rows = await query<{ id: string }>(
    `INSERT INTO games (escrow_game_id, chain, mode, buy_in, max_players, status, started_at)
     VALUES ($1, $2, $3, $4, $5, 'playing', NOW())
     RETURNING id`,
    [input.escrowGameId, input.chain, input.mode, input.buyIn, input.maxPlayers],
  );
  return rows[0]!.id;
}

export async function recordGameFinished(input: {
  gameId: string;
  winnerId: string;
  totalPool: string;
  platformFee: string;
  winnerPayout: string;
  settlementTxHash: string | null;
}): Promise<void> {
  await query(
    `UPDATE games SET
        status = 'finished',
        winner_id = $1,
        total_pool = $2,
        platform_fee = $3,
        winner_payout = $4,
        settlement_tx_hash = $5,
        finished_at = NOW()
     WHERE id = $6`,
    [
      input.winnerId,
      input.totalPool,
      input.platformFee,
      input.winnerPayout,
      input.settlementTxHash,
      input.gameId,
    ],
  );
}
