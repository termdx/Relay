/**
 * The full Drizzle schema. Each module owns its own table definitions; this
 * barrel is what the driver (and drizzle-kit) sees as one schema.
 */
export * from '../modules/auth/auth.schema';
export * from '../modules/outbox/outbox.schema';
export * from '../modules/client/client.schema';
export * from '../modules/project/project.schema';
export * from '../modules/timeline/timeline.schema';
export * from '../modules/todo/todo.schema';
export * from '../modules/knowledge/knowledge.schema';
export * from '../modules/portal/portal.schema';
export * from '../modules/decision/decision.schema';
export * from '../modules/meeting/meeting.schema';
export * from '../modules/approval/approval.schema';
