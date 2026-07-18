import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { createHash } from 'node:crypto';
import { asc, cosineDistance, eq } from 'drizzle-orm';
import { DRIZZLE, type RelayDb } from '../../database/drizzle.provider';
import { DOMAIN_EVENT, type DomainEvent } from '../../events/domain-event';
import { ANSWERER, type Answerer } from '../ai/answerer';
import { EMBEDDER, type Embedder } from '../ai/embedder';
import { timelineEvents } from '../timeline/timeline.schema';
import { renderEvent } from './event-renderer';
import { knowledgeChunks, type KnowledgeChunk } from './knowledge.schema';

export interface AskResult {
  answer: string;
  sources: {
    ref: number;
    cited: boolean;
    snippet: string;
    type: string;
    occurredAt: Date;
  }[];
}

const RETRIEVAL_LIMIT = 8;

/** Key-sorted stringify: jsonb round-trips reorder keys; hashes must not care. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * The knowledge engine (knowledge.md). Events in, knowledge out: subscribes
 * to the firehose, renders each project event to text, embeds it, and stores
 * it with provenance. Derived state — `reindex` replays the timeline and the
 * content-hash sourceRef makes that idempotent. `ask` retrieves scoped by
 * project in SQL and grounds the answer with citations.
 */
@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: RelayDb,
    @Inject(EMBEDDER) private readonly embedder: Embedder,
    @Inject(ANSWERER) private readonly answerer: Answerer,
  ) {}

  @OnEvent(DOMAIN_EVENT)
  async ingest(event: DomainEvent): Promise<void> {
    if (!event.projectId) return;
    try {
      await this.ingestOne({
        type: event.type,
        occurredAt: event.occurredAt,
        projectId: event.projectId,
        clientId: event.clientId ?? null,
        payload: event.payload,
      });
    } catch (error) {
      // Never break the emitting flow; reindex can heal missed chunks.
      this.logger.error(
        `ingest failed for ${event.type}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async ingestOne(source: {
    type: string;
    occurredAt: Date;
    projectId: string;
    clientId: string | null;
    payload: Record<string, unknown>;
  }): Promise<boolean> {
    const content = renderEvent(source);
    if (!content) return false;

    const sourceRef = createHash('sha256')
      .update(
        `${source.type}|${source.occurredAt.toISOString()}|${stableStringify(source.payload)}`,
      )
      .digest('hex');

    const [embedding] = await this.embedder.embed([content]);
    const inserted = await this.db
      .insert(knowledgeChunks)
      .values({
        projectId: source.projectId,
        clientId: source.clientId,
        content,
        embedding: embedding!,
        sourceType: source.type,
        sourceRef,
        occurredAt: source.occurredAt,
      })
      .onConflictDoNothing({ target: knowledgeChunks.sourceRef })
      .returning({ id: knowledgeChunks.id });
    return inserted.length > 0;
  }

  /** Replay the timeline into the knowledge base (idempotent). */
  async reindex(): Promise<{ scanned: number; added: number }> {
    const rows = await this.db.query.timelineEvents.findMany({
      orderBy: [asc(timelineEvents.occurredAt)],
    });
    let added = 0;
    for (const row of rows) {
      const wasAdded = await this.ingestOne({
        type: row.type,
        occurredAt: row.occurredAt,
        projectId: row.projectId,
        clientId: row.clientId,
        payload: row.payload,
      });
      if (wasAdded) added += 1;
    }
    this.logger.log(`reindex: scanned ${rows.length}, added ${added}`);
    return { scanned: rows.length, added };
  }

  /** Grounded Q&A over one project's knowledge. Scoping is the WHERE clause. */
  async ask(projectId: string, question: string): Promise<AskResult> {
    const [queryVector] = await this.embedder.embed([question]);
    const distance = cosineDistance(knowledgeChunks.embedding, queryVector!);

    const retrieved: (KnowledgeChunk & { distance: unknown })[] = await this.db
      .select({
        id: knowledgeChunks.id,
        projectId: knowledgeChunks.projectId,
        clientId: knowledgeChunks.clientId,
        content: knowledgeChunks.content,
        embedding: knowledgeChunks.embedding,
        sourceType: knowledgeChunks.sourceType,
        sourceRef: knowledgeChunks.sourceRef,
        occurredAt: knowledgeChunks.occurredAt,
        createdAt: knowledgeChunks.createdAt,
        distance,
      })
      .from(knowledgeChunks)
      .where(eq(knowledgeChunks.projectId, projectId))
      .orderBy(distance)
      .limit(RETRIEVAL_LIMIT);

    const context = retrieved.map((chunk, index) => ({
      ref: index + 1,
      text: chunk.content,
    }));
    const grounded = await this.answerer.answer(question, context);
    const cited = new Set(grounded.citedRefs);

    return {
      answer: grounded.answer,
      sources: retrieved.map((chunk, index) => ({
        ref: index + 1,
        cited: cited.has(index + 1),
        snippet: chunk.content,
        type: chunk.sourceType,
        occurredAt: chunk.occurredAt,
      })),
    };
  }
}
