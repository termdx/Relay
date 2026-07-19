import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  ServiceUnavailableException,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type RelayDb } from '../../database/drizzle.provider';
import { Public } from '../auth/public.decorator';
import { OutboxService } from '../outbox/outbox.service';
import { projects } from '../project/project.schema';
import { MeetingService } from './meeting.service';

/** Outbox message type: a transcript arrived and should become a draft. */
export const TRANSCRIPT_INGESTED = 'meeting.transcript_ingested';

class IngestTranscriptDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(40)
  @MaxLength(500_000)
  transcript!: string;
}

/**
 * Consumes ingested transcripts off the outbox: resolves the project's
 * client + repo and runs the normal meeting pipeline — the rest (draft,
 * approval email, issues, todos, knowledge) is already automatic.
 */
@Injectable()
export class TranscriptIngestHandler implements OnModuleInit {
  private readonly logger = new Logger(TranscriptIngestHandler.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: RelayDb,
    private readonly outbox: OutboxService,
    private readonly meetings: MeetingService,
  ) {}

  onModuleInit(): void {
    this.outbox.register(TRANSCRIPT_INGESTED, async (payload) => {
      const { projectId, title, transcript } = payload as {
        projectId: string;
        title: string;
        transcript: string;
      };
      const project = await this.db.query.projects.findFirst({
        where: eq(projects.id, projectId),
        with: { client: true },
      });
      if (!project) throw new Error(`Project ${projectId} no longer exists.`);
      const meeting = await this.meetings.createFromTranscript({
        projectId,
        title,
        transcript,
        clientEmail: project.client.email,
        githubRepo: project.githubRepo ?? 'unconfigured/unconfigured',
      });
      this.logger.log(
        `ingested transcript → meeting "${meeting.title}" (${meeting.tasks.length} drafted tasks)`,
      );
    });
  }
}

/**
 * Inbound transcripts (integrations.md): one URL per project, shared-secret
 * token — anything that can POST JSON (Fireflies, Fathom, Zapier, n8n, a
 * shortcut) turns a meeting into a Relay draft with zero pasting. Responds
 * 202 immediately; drafting runs durably on the outbox.
 */
@Public()
@Controller('webhooks/transcript')
export class TranscriptIngestController {
  private readonly logger = new Logger(TranscriptIngestController.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: RelayDb,
    private readonly config: ConfigService,
    private readonly outbox: OutboxService,
  ) {}

  @Post(':projectId')
  @HttpCode(202)
  async receive(
    @Param('projectId') projectId: string,
    @Query('token') token: string | undefined,
    @Body() dto: IngestTranscriptDto,
  ): Promise<{ status: string }> {
    const secret = this.config.get<string>('INGEST_SECRET');
    if (!secret) {
      throw new ServiceUnavailableException(
        'Ingest secret not configured — run `relay up`.',
      );
    }
    if (!token || !safeEqual(token, secret)) {
      this.logger.warn('dropped transcript with missing/invalid token');
      throw new ForbiddenException('Invalid token.');
    }
    const project = await this.db.query.projects.findFirst({
      where: eq(projects.id, projectId),
      columns: { id: true, name: true },
    });
    if (!project) throw new NotFoundException('Project not found.');

    await this.outbox.enqueue(this.db, TRANSCRIPT_INGESTED, {
      projectId,
      title:
        dto.title?.trim() ||
        `Meeting — ${new Date().toISOString().slice(0, 10)}`,
      transcript: dto.transcript,
    });
    this.logger.log(`transcript accepted for project ${project.name}`);
    return { status: 'accepted — drafting will begin shortly' };
  }
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
