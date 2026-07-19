import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export type UserRole = 'owner' | 'member';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  /** scrypt-derived; never the raw password. See PasswordService. */
  passwordHash: text('password_hash').notNull(),
  role: text('role').$type<UserRole>().notNull().default('member'),
  /** data:image/… URI or https URL; the desktop shows it in the sidebar. */
  avatar: text('avatar'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type User = typeof users.$inferSelect;

/**
 * Team invite links. The raw token only ever appears in the link itself —
 * the DB stores its sha256, so a leaked dump can't mint memberships.
 */
export const invites = pgTable('invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  tokenHash: text('token_hash').notNull().unique(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  /** null = unlimited uses until expiry/revocation. */
  maxUses: integer('max_uses'),
  usedCount: integer('used_count').notNull().default(0),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Invite = typeof invites.$inferSelect;

/** The shape safe to return over the API — never includes passwordHash. */
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatar: string | null;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatar: user.avatar,
  };
}
