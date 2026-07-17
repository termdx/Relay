import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

interface ExtensionRow {
  version: string;
}

/**
 * Ensures Postgres has the extensions Relay depends on.
 *
 * `vector` (pgvector) is enabled up front so the knowledge base can store
 * embeddings without a later migration to turn it on.
 *
 * ORDERING CAVEAT: this runs *after* TypeORM's `synchronize`. That is fine
 * while no entity declares a `vector` column. The moment one does, schema sync
 * would run before the extension exists — at that point move extension setup
 * into a migration that runs first (migrations are needed before real data
 * lands anyway).
 */
@Injectable()
export class DatabaseBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseBootstrapService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.dataSource.query('CREATE EXTENSION IF NOT EXISTS vector');
    const rows = (await this.dataSource.query(
      "SELECT extversion AS version FROM pg_extension WHERE extname = 'vector'",
    )) as ExtensionRow[];
    this.logger.log(`pgvector ready (v${rows[0]?.version ?? 'unknown'})`);
  }
}
