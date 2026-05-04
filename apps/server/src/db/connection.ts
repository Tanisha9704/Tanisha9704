import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
});

export async function query<T extends object = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const res = await pool.query<T>(text, params as never);
  return res.rows;
}
