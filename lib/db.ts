import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __weatherPool: Pool | undefined;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local (or export it) before querying the database."
    );
  }
  // Tiger Cloud / managed Postgres typically require SSL. Enable it when the
  // URL is not an obvious localhost connection.
  const isLocal = /@(localhost|127\.0\.0\.1)/.test(connectionString);
  return new Pool({
    connectionString,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
    max: 10,
  });
}

// Reuse a single pool across hot reloads in dev.
export const pool: Pool = global.__weatherPool ?? createPool();
if (process.env.NODE_ENV !== "production") {
  global.__weatherPool = pool;
}

export async function query<T = unknown>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}
