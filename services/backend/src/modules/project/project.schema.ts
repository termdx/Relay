import { relations } from 'drizzle-orm';
import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { clients } from '../client/client.schema';

export type ProjectStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED';

/**
 * What the client sees on the portal — the agency's call, per project
 * (portal.md). Enforced server-side in the portal API, never by UI hiding.
 * Approvals are not togglable: they're the core loop.
 */
export interface PortalSettings {
  /** Stat tiles + activity chart. */
  showAnalytics: boolean;
  /** The activity feed. */
  showFeed: boolean;
  /** Raw code events (pushes, PRs) inside the feed. */
  feedShowsCode: boolean;
  /** Deliverables list. */
  showTodos: boolean;
  /** Decisions log. */
  showDecisions: boolean;
  /** The Relay AI chat. */
  showAsk: boolean;
}

export const DEFAULT_PORTAL_SETTINGS: PortalSettings = {
  showAnalytics: true,
  showFeed: true,
  feedShowsCode: true,
  showTodos: true,
  showDecisions: true,
  showAsk: true,
};

/** Row value (sparse) → effective settings. */
export function resolvePortalSettings(
  stored: Partial<PortalSettings> | null,
): PortalSettings {
  return { ...DEFAULT_PORTAL_SETTINGS, ...(stored ?? {}) };
}

/**
 * A project under a client. Links to the client's external tool surfaces
 * (repo today; channels and calendars as those integrations land) so events
 * can be attributed to the right project.
 */
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').$type<ProjectStatus>().notNull().default('ACTIVE'),
  /** "owner/repo" — where approved tasks land. Multi-repo comes later. */
  githubRepo: text('github_repo'),
  /** Sparse overrides on DEFAULT_PORTAL_SETTINGS; null = all defaults. */
  portalSettings: jsonb('portal_settings').$type<Partial<PortalSettings>>(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const projectsRelations = relations(projects, ({ one }) => ({
  client: one(clients, {
    fields: [projects.clientId],
    references: [clients.id],
  }),
}));

export type Project = typeof projects.$inferSelect;
