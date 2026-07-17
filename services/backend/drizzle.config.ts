import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit config. Generate SQL migrations after changing any *.schema.ts:
 *   pnpm db:generate
 * Migrations are applied automatically on boot (DatabaseBootstrapService).
 */
export default defineConfig({
  schema: './src/database/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://relay:relay@localhost:5432/relay',
  },
});
