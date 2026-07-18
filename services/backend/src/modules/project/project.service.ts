import {
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DRIZZLE, type RelayDb } from '../../database/drizzle.provider';
import { DomainEventBus } from '../../events/domain-event-bus';
import { PROJECT_CREATED } from '../../events/domain-event';
import { clients, type Client } from '../client/client.schema';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';
import { projects, type Project } from './project.schema';

export type ProjectWithClient = Project & { client: Client };

@Injectable()
export class ProjectService {
  constructor(
    @Inject(DRIZZLE) private readonly db: RelayDb,
    private readonly events: DomainEventBus,
  ) {}

  async create(dto: CreateProjectDto): Promise<ProjectWithClient> {
    const client = await this.db.query.clients.findFirst({
      where: eq(clients.id, dto.clientId),
    });
    if (!client) {
      throw new NotFoundException(`Client ${dto.clientId} not found.`);
    }

    const [project] = await this.db
      .insert(projects)
      .values({
        clientId: dto.clientId,
        name: dto.name,
        description: dto.description ?? null,
        githubRepo: dto.githubRepo ?? null,
      })
      .returning();

    this.events.emit({
      type: PROJECT_CREATED,
      clientId: dto.clientId,
      projectId: project!.id,
      actor: { kind: 'user', id: 'owner' },
      source: 'project',
      payload: { name: project!.name },
    });
    return this.findOne(project!.id);
  }

  list(): Promise<ProjectWithClient[]> {
    return this.db.query.projects.findMany({
      with: { client: true },
      orderBy: [desc(projects.updatedAt)],
    });
  }

  async findOne(id: string): Promise<ProjectWithClient> {
    const project = await this.db.query.projects.findFirst({
      where: eq(projects.id, id),
      with: { client: true },
    });
    if (!project) throw new NotFoundException(`Project ${id} not found.`);
    return project;
  }

  async update(id: string, dto: UpdateProjectDto): Promise<ProjectWithClient> {
    const existing = await this.findOne(id);
    const { portalSettings, ...rest } = dto;
    const changes: Record<string, unknown> = { ...rest };
    if (portalSettings) {
      // Merge sparse overrides so a single-toggle PATCH keeps the others.
      // The DTO is a class instance: unset fields exist as undefined (ES2022
      // class fields) and would clobber stored values if spread naively.
      const overrides = Object.fromEntries(
        Object.entries({ ...portalSettings }).filter(
          ([, value]) => value !== undefined,
        ),
      );
      changes.portalSettings = {
        ...(existing.portalSettings ?? {}),
        ...overrides,
      };
    }
    if (Object.keys(changes).length > 0) {
      await this.db.update(projects).set(changes).where(eq(projects.id, id));
    }
    return this.findOne(id);
  }
}
