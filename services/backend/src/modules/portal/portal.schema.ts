import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { clients } from '../client/client.schema';

/** Single-use magic-link tokens for portal sign-in (security.md). */
export const portalLoginTokens = pgTable('portal_login_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type PortalLoginToken = typeof portalLoginTokens.$inferSelect;
