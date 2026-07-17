import {
  Global,
  Inject,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { Pool } from 'pg';
import { DatabaseBootstrapService } from './database-bootstrap.service';
import { DRIZZLE, PG_POOL, drizzleProvider, pgPoolProvider } from './drizzle.provider';

/**
 * Infrastructure module: the Postgres connection, the Drizzle handle, and
 * boot-time preparation (extensions + migrations). Global so any module can
 * inject DRIZZLE without importing this.
 */
@Global()
@Module({
  providers: [pgPoolProvider, drizzleProvider, DatabaseBootstrapService],
  exports: [DRIZZLE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
