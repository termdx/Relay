import { ConfigService } from '@nestjs/config';
import type { Provider } from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export const DRIZZLE = Symbol('DRIZZLE');
export const PG_POOL = Symbol('PG_POOL');

/** The typed database handle injected into services. */
export type RelayDb = NodePgDatabase<typeof schema>;

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
