import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';
import { clients } from '../client/client.schema';
import { projects } from '../project/project.schema';
import { EMBEDDING_DIMENSIONS } from '../ai/embedder';

/**
 * The knowledge base (knowledge.md): every tracked signal, embedded with
 * provenance. Derived state — rebuildable by replaying the timeline — so the
 * content hash (sourceRef) makes ingestion idempotent, and retrieval scoping
 * (client/project) happens in SQL, never in the prompt.
 */
export const knowledgeChunks = pgTable(
  'knowledge_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    /** Denormalized for portal scoping without a join. */
    clientId: uuid('client_id').references(() => clients.id, {
      onDelete: 'cascade',
    }),
    /** The rendered text that was embedded. */
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    /** Event type this chunk came from, e.g. "meeting.approved". */
    sourceType: text('source_type').notNull(),
    /** Content hash — replaying the timeline can never duplicate a chunk. */
    sourceRef: text('source_ref').notNull().unique(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('knowledge_chunks_embedding_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops'),
    ),
    index('knowledge_chunks_project_idx').on(table.projectId),
  ],
);

export type KnowledgeChunk = typeof knowledgeChunks.$inferSelect;
