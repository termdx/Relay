import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { DRIZZLE, type RelayDb } from './drizzle.provider';

type ExtensionRow = { extversion: string } & Record<string, unknown>;

/**
 * Prepares the database on boot, in a deliberate order:
 *
 *   1. enable the `vector` (pgvector) extension
 *   2. run migrations
 *
 * The extension is created *first* so that a migration is free to declare a
 * vector column — the knowledge base can land without any bootstrap change.
 */
@Injectable()
export class DatabaseBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseBootstrapService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: RelayDb,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);

    const migrationsFolder = this.config.get<string>(
      'DRIZZLE_MIGRATIONS',
      'drizzle',
    );
    await migrate(this.db, { migrationsFolder });

    const result = await this.db.execute<ExtensionRow>(
      sql`SELECT extversion FROM pg_extension WHERE extname = 'vector'`,
    );
    this.logger.log(
      `schema migrated; pgvector ready (v${result.rows[0]?.extversion ?? 'unknown'})`,
    );
  }
}
