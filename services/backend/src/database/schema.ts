/**
 * The full Drizzle schema. Each module owns its own table definitions; this
 * barrel is what the driver (and drizzle-kit) sees as one schema.
 */
export * from '../modules/meeting/meeting.schema';
export * from '../modules/approval/approval.schema';
