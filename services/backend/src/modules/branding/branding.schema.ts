import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Agency branding for the client portal (portal.md) — a singleton row.
 * The logo is a small data URI or an https URL; no object storage needed.
 */
export const branding = pgTable('branding', {
  id: uuid('id').primaryKey().defaultRandom(),
  agencyName: text('agency_name'),
  /** data:image/… URI (≤1MB image) or an https URL. */
  logo: text('logo'),
  /** #rrggbb accent applied to the portal theme. */
  accentColor: text('accent_color'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type BrandingRow = typeof branding.$inferSelect;
