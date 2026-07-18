import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql } from 'drizzle-orm';
import {
  DRIZZLE,
  type RelayDb,
  type RelayTx,
} from '../../database/drizzle.provider';
import { outboxMessages, type OutboxMessage } from './outbox.schema';

export type OutboxHandler = (payload: Record<string, unknown>) => Promise<void>;

const MAX_ATTEMPTS = 8;
/** How long a PROCESSING claim is honored before another tick may reclaim it. */
const VISIBILITY_TIMEOUT_S = 60;

/** Exponential backoff: 2s, 4s, 8s … capped at 5 minutes. */
export function backoffMs(attempts: number): number {
  return Math.min(2 ** attempts * 1000, 5 * 60 * 1000);
}

/**
 * The transactional outbox. Writers enqueue side effects inside their own
 * transaction; the relay loop claims due messages (SKIP LOCKED, so multiple
 * backend instances are safe), dispatches to the registered handler, and
 * retries with exponential backoff. After MAX_ATTEMPTS the message is parked
 * as FAILED for a human. Handlers must be idempotent.
 */
@Injectable()
export class OutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxService.name);
  private readonly handlers = new Map<string, OutboxHandler>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;

  constructor(
    @Inject(DRIZZLE) private readonly db: RelayDb,
    private readonly config: ConfigService,
  ) {}

  /** Enqueue a message inside the caller's transaction (or the root handle). */
  async enqueue(
    db: RelayDb | RelayTx,
    type: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await db.insert(outboxMessages).values({ type, payload });
  }

  /** Register the handler for a message type. One handler per type. */
  register(type: string, handler: OutboxHandler): void {
    if (this.handlers.has(type)) {
      throw new Error(`Outbox handler for "${type}" already registered.`);
    }
    this.handlers.set(type, handler);
  }

  onModuleInit(): void {
    const pollMs = Number(this.config.get('OUTBOX_POLL_MS', '2000'));
    if (pollMs <= 0) return; // disabled (tests)
    this.timer = setInterval(() => void this.tick(), pollMs);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** One relay pass. Public so tests / drains can invoke it directly. */
  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const claimed = await this.claim(10);
      for (const message of claimed) {
        await this.dispatch(message);
      }
    } catch (error) {
      this.logger.error(
        'outbox tick failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.ticking = false;
    }
  }

  /** Claim due messages: PENDING past nextAttemptAt, or stuck PROCESSING. */
  private async claim(limit: number): Promise<OutboxMessage[]> {
    const result = await this.db.execute(sql`
      UPDATE outbox_messages SET status = 'PROCESSING', updated_at = now()
      WHERE id IN (
        SELECT id FROM outbox_messages
        WHERE (status = 'PENDING' AND next_attempt_at <= now())
           OR (status = 'PROCESSING'
               AND updated_at <= now() - make_interval(secs => ${VISIBILITY_TIMEOUT_S}))
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      )
      RETURNING id, type, payload, status, attempts,
                next_attempt_at AS "nextAttemptAt", last_error AS "lastError",
                created_at AS "createdAt", updated_at AS "updatedAt"
    `);
    return result.rows as unknown as OutboxMessage[];
  }

  private async dispatch(message: OutboxMessage): Promise<void> {
    const handler = this.handlers.get(message.type);
    const attempts = message.attempts + 1;
    try {
      if (!handler) {
        throw new Error(`No outbox handler registered for "${message.type}".`);
      }
      await handler(message.payload);
      await this.db.execute(sql`
        UPDATE outbox_messages SET status = 'DONE', attempts = ${attempts},
          last_error = NULL, updated_at = now()
        WHERE id = ${message.id}
      `);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const failed = attempts >= MAX_ATTEMPTS;
      await this.db.execute(sql`
        UPDATE outbox_messages
        SET status = ${failed ? 'FAILED' : 'PENDING'},
            attempts = ${attempts},
            last_error = ${detail},
            next_attempt_at = now() + make_interval(secs => ${backoffMs(attempts) / 1000}),
            updated_at = now()
        WHERE id = ${message.id}
      `);
      this.logger[failed ? 'error' : 'warn'](
        `outbox ${message.type} attempt ${attempts}/${MAX_ATTEMPTS} failed${failed ? ' — parked as FAILED' : ''}: ${detail}`,
      );
    }
  }
}
