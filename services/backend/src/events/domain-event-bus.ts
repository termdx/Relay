import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DOMAIN_EVENT, type DomainEvent } from './domain-event';

/**
 * The one way domain events leave a module. Each event is emitted twice:
 *
 *   1. under its own `type` — for targeted handlers (module-to-module), and
 *   2. on the `DOMAIN_EVENT` firehose — for cross-cutting consumers
 *      (timeline today; knowledge ingestion later).
 *
 * Delivery is in-process for now; the transactional outbox replaces this
 * before real external adapters hang off events (temporal.md ladder).
 */
@Injectable()
export class DomainEventBus {
  private readonly logger = new Logger(DomainEventBus.name);

  constructor(private readonly emitter: EventEmitter2) {}

  emit<T extends Record<string, unknown>>(
    event: Omit<DomainEvent<T>, 'occurredAt'> & { occurredAt?: Date },
  ): void {
    const full: DomainEvent<T> = { occurredAt: new Date(), ...event };
    this.logger.debug(`${full.type} (project=${full.projectId ?? '—'})`);
    this.emitter.emit(full.type, full);
    this.emitter.emit(DOMAIN_EVENT, full);
  }
}
