import { Pool } from 'pg';

const globalForPool = global as unknown as { pool?: Pool };

export const pool =
  globalForPool.pool ??
  (globalForPool.pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  }));

export default pool;
