import { ConfigService } from '@nestjs/config';
import type { Provider } from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export const DRIZZLE = Symbol('DRIZZLE');
export const PG_POOL = Symbol('PG_POOL');

/** The typed database handle injected into services. */
export type RelayDb = NodePgDatabase<typeof schema>;

/** The handle inside `db.transaction(async (tx) => …)` — for code that must
 * run within the caller's transaction (e.g. outbox enqueue). */
export type RelayTx = Parameters<Parameters<RelayDb['transaction']>[0]>[0];

export const pgPoolProvider: Provider = {
  provide: PG_POOL,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Pool =>
    new Pool({ connectionString: config.getOrThrow<string>('DATABASE_URL') }),
};

export const drizzleProvider: Provider = {
  provide: DRIZZLE,
  inject: [PG_POOL],
  useFactory: (pool: Pool): RelayDb => drizzle(pool, { schema }),
};
