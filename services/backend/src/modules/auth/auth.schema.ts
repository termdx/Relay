import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export type UserRole = 'owner' | 'member';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  /** scrypt-derived; never the raw password. See PasswordService. */
  passwordHash: text('password_hash').notNull(),
  role: text('role').$type<UserRole>().notNull().default('member'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type User = typeof users.$inferSelect;

/** The shape safe to return over the API — never includes passwordHash. */
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export function toPublicUser(user: User): PublicUser {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}
