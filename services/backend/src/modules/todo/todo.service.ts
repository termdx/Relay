import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { DRIZZLE, type RelayDb } from '../../database/drizzle.provider';
import { DomainEventBus } from '../../events/domain-event-bus';
import {
  MEETING_APPROVED,
  TODO_COMPLETED,
  TODO_CREATED,
  TODO_REOPENED,
} from '../../events/domain-event';
import { OutboxService } from '../outbox/outbox.service';
import { CreateTodoDto, UpdateTodoStatusDto } from './dto/todo.dto';
import { todos, type Todo } from './todo.schema';

/** Payload of the meeting-approved outbox message the todo module consumes. */
export interface MeetingApprovedSync {
  meetingId: string;
  projectId: string | null;
  clientEmail: string;
  tasks: {
    id: string;
    title: string;
    body: string;
    assignee: string | null;
    url: string | null;
  }[];
}

@Injectable()
export class TodoService implements OnModuleInit {
  private readonly logger = new Logger(TodoService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: RelayDb,
    private readonly events: DomainEventBus,
    private readonly outbox: OutboxService,
  ) {}

  /** Approved meeting tasks become project todos — durably, idempotently. */
  onModuleInit(): void {
    this.outbox.register(MEETING_APPROVED, async (payload) => {
      const sync = payload as unknown as MeetingApprovedSync;
      if (!sync.projectId) return; // unattributed meeting: nothing to track
      await this.createFromMeeting(sync);
    });
  }

  async createFromMeeting(sync: MeetingApprovedSync): Promise<void> {
    let created = 0;
    for (const task of sync.tasks) {
      // sourceRef is unique — redelivery can never duplicate a todo.
      const inserted = await this.db
        .insert(todos)
        .values({
          projectId: sync.projectId!,
          title: task.title,
          body: task.body,
          assignee: task.assignee,
          source: 'meeting',
          sourceRef: task.id,
          externalUrl: task.url,
        })
        .onConflictDoNothing({ target: todos.sourceRef })
        .returning();
      const todo = inserted[0];
      if (!todo) continue;
      created += 1;
      this.emitCreated(todo, { kind: 'client', email: sync.clientEmail });
    }
    if (created > 0) {
      this.logger.log(
        `Synced ${created} todo(s) from meeting ${sync.meetingId}.`,
      );
    }
  }

  async create(projectId: string, dto: CreateTodoDto): Promise<Todo> {
    const [todo] = await this.db
      .insert(todos)
      .values({
        projectId,
        title: dto.title,
        body: dto.body ?? '',
        assignee: dto.assignee ?? null,
      })
      .returning();
    this.emitCreated(todo!, { kind: 'user', id: 'owner' });
    return todo!;
  }

  /** Open first, then completed; stable order within each group. */
  listByProject(projectId: string): Promise<Todo[]> {
    return this.db.query.todos.findMany({
      where: eq(todos.projectId, projectId),
      orderBy: [asc(todos.status), asc(todos.createdAt)],
    });
  }

  async setStatus(id: string, dto: UpdateTodoStatusDto): Promise<Todo> {
    const existing = await this.db.query.todos.findFirst({
      where: eq(todos.id, id),
    });
    if (!existing) throw new NotFoundException(`Todo ${id} not found.`);
    if (existing.status === dto.status) return existing;

    const [updated] = await this.db
      .update(todos)
      .set({
        status: dto.status,
        completedAt: dto.status === 'DONE' ? new Date() : null,
      })
      .where(eq(todos.id, id))
      .returning();

    this.events.emit({
      type: dto.status === 'DONE' ? TODO_COMPLETED : TODO_REOPENED,
      projectId: existing.projectId,
      actor: { kind: 'user', id: 'owner' },
      source: 'todo',
      payload: { todoId: id, title: existing.title },
    });
    return updated!;
  }

  private emitCreated(
    todo: Todo,
    actor: { kind: 'user'; id: string } | { kind: 'client'; email: string },
  ): void {
    this.events.emit({
      type: TODO_CREATED,
      projectId: todo.projectId,
      actor,
      source: 'todo',
      payload: { todoId: todo.id, title: todo.title, origin: todo.source },
    });
  }
}
