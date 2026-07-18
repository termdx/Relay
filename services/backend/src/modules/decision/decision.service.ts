import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DRIZZLE, type RelayDb } from '../../database/drizzle.provider';
import { DomainEventBus } from '../../events/domain-event-bus';
import { DECISION_RECORDED } from '../../events/domain-event';
import { CreateDecisionDto } from './dto/decision.dto';
import { decisions, type Decision } from './decision.schema';

@Injectable()
export class DecisionService {
  constructor(
    @Inject(DRIZZLE) private readonly db: RelayDb,
    private readonly events: DomainEventBus,
  ) {}

  async create(projectId: string, dto: CreateDecisionDto): Promise<Decision> {
    const [decision] = await this.db
      .insert(decisions)
      .values({
        projectId,
        title: dto.title,
        detail: dto.detail ?? '',
        decidedBy: 'owner',
      })
      .returning();

    this.events.emit({
      type: DECISION_RECORDED,
      projectId,
      actor: { kind: 'user', id: 'owner' },
      source: 'decision',
      payload: { decisionId: decision!.id, title: decision!.title },
    });
    return decision!;
  }

  listByProject(projectId: string): Promise<Decision[]> {
    return this.db.query.decisions.findMany({
      where: eq(decisions.projectId, projectId),
      orderBy: [desc(decisions.createdAt)],
    });
  }
}
