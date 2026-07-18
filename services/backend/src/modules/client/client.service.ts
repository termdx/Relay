import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DRIZZLE, type RelayDb } from '../../database/drizzle.provider';
import { DomainEventBus } from '../../events/domain-event-bus';
import { CLIENT_CREATED } from '../../events/domain-event';
import { CreateClientDto, UpdateClientDto } from './dto/client.dto';
import { clients, type Client } from './client.schema';
import { projects, type Project } from '../project/project.schema';

export type ClientWithProjects = Client & { projects: Project[] };

@Injectable()
export class ClientService {
  constructor(
    @Inject(DRIZZLE) private readonly db: RelayDb,
    private readonly events: DomainEventBus,
  ) {}

  async create(dto: CreateClientDto): Promise<Client> {
    const existing = await this.db.query.clients.findFirst({
      where: eq(clients.email, dto.email),
    });
    if (existing) {
      throw new ConflictException(
        `A client with email ${dto.email} already exists.`,
      );
    }

    const [client] = await this.db
      .insert(clients)
      .values({
        name: dto.name,
        company: dto.company ?? null,
        email: dto.email,
        notes: dto.notes ?? null,
      })
      .returning();

    this.events.emit({
      type: CLIENT_CREATED,
      clientId: client!.id,
      actor: { kind: 'user', id: 'owner' },
      source: 'client',
      payload: { name: client!.name, email: client!.email },
    });
    return client!;
  }

  /** Newest first, each with its projects — the desktop list view. */
  list(): Promise<ClientWithProjects[]> {
    return this.db.query.clients.findMany({
      with: { projects: { orderBy: [desc(projects.updatedAt)] } },
      orderBy: [desc(clients.updatedAt)],
    });
  }

  async findOne(id: string): Promise<ClientWithProjects> {
    const client = await this.db.query.clients.findFirst({
      where: eq(clients.id, id),
      with: { projects: { orderBy: [desc(projects.updatedAt)] } },
    });
    if (!client) throw new NotFoundException(`Client ${id} not found.`);
    return client;
  }

  async update(id: string, dto: UpdateClientDto): Promise<ClientWithProjects> {
    await this.findOne(id);
    if (Object.keys(dto).length > 0) {
      await this.db.update(clients).set(dto).where(eq(clients.id, id));
    }
    return this.findOne(id);
  }
}
