import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { desc, eq } from 'drizzle-orm';
import { DRIZZLE, type RelayDb } from '../../database/drizzle.provider';
import { DOMAIN_EVENT, type DomainEvent } from '../../events/domain-event';
import { projects } from '../project/project.schema';
import { timelineEvents, type TimelineEvent } from './timeline.schema';

@Injectable()
export class TimelineService {
  private readonly logger = new Logger(TimelineService.name);

  constructor(@Inject(DRIZZLE) private readonly db: RelayDb) {}

  /**
   * Firehose subscriber: any domain event attributed to a project becomes a
   * timeline entry. Enriches a missing clientId from the project row so
   * emitters don't have to know it.
   */
  @OnEvent(DOMAIN_EVENT)
  async record(event: DomainEvent): Promise<void> {
    if (!event.projectId) return;
    try {
      let clientId = event.clientId ?? null;
      if (!clientId) {
        const project = await this.db.query.projects.findFirst({
          where: eq(projects.id, event.projectId),
          columns: { clientId: true },
        });
        clientId = project?.clientId ?? null;
      }
      await this.db.insert(timelineEvents).values({
        projectId: event.projectId,
        clientId,
        type: event.type,
        actor: event.actor,
        payload: event.payload,
        source: event.source,
        occurredAt: event.occurredAt,
      });
    } catch (error) {
      // Never let feed persistence break the emitting flow.
      this.logger.error(
        `failed to record ${event.type} for project ${event.projectId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** Project feed, newest first. */
  listByProject(projectId: string, limit = 100): Promise<TimelineEvent[]> {
    return this.db.query.timelineEvents.findMany({
      where: eq(timelineEvents.projectId, projectId),
      orderBy: [desc(timelineEvents.occurredAt)],
      limit,
    });
  }
}
