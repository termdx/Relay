import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Inject,
  Injectable,
  Logger,
  Post,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type RelayDb } from '../../../database/drizzle.provider';
import { DomainEventBus } from '../../../events/domain-event-bus';
import {
  BITBUCKET_PR_DECLINED,
  BITBUCKET_PR_MERGED,
  BITBUCKET_PR_OPENED,
  BITBUCKET_PUSH,
} from '../../../events/domain-event';
import { Public } from '../../auth/public.decorator';
import { projects } from '../../project/project.schema';

/** The slice of Bitbucket Cloud webhook payloads Relay reads. */
interface BitbucketPayload {
  repository?: { full_name?: string };
  actor?: { nickname?: string; display_name?: string };
  push?: {
    changes?: {
      new?: { name?: string } | null;
      commits?: { message?: string }[];
    }[];
  };
  pullrequest?: {
    id?: number;
    title?: string;
    links?: { html?: { href?: string } };
  };
}

@Injectable()
export class BitbucketWebhookService {
  private readonly logger = new Logger(BitbucketWebhookService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: RelayDb,
    private readonly events: DomainEventBus,
  ) {}

  async handle(eventKey: string, payload: BitbucketPayload): Promise<string> {
    const fullName = payload.repository?.full_name;
    if (!fullName) return 'ignored: no repository in payload';

    const project = await this.db.query.projects.findFirst({
      where: eq(projects.githubRepo, `bitbucket:${fullName}`),
      columns: { id: true, clientId: true },
    });
    if (!project) return `ignored: no project tracks bitbucket:${fullName}`;

    const normalized = this.normalize(eventKey, payload);
    if (!normalized) return `ignored: unhandled event ${eventKey}`;

    this.events.emit({
      type: normalized.type,
      projectId: project.id,
      clientId: project.clientId,
      actor: { kind: 'integration', id: 'bitbucket' },
      source: 'bitbucket',
      payload: {
        repo: fullName,
        author: payload.actor?.nickname ?? payload.actor?.display_name ?? null,
        ...normalized.payload,
      },
    });
    this.logger.log(`${normalized.type} on ${fullName} → project ${project.id}`);
    return `recorded: ${normalized.type}`;
  }

  private normalize(
    eventKey: string,
    payload: BitbucketPayload,
  ): { type: string; payload: Record<string, unknown> } | null {
    switch (eventKey) {
      case 'repo:push': {
        const change = payload.push?.changes?.[0];
        const commits = change?.commits ?? [];
        if (commits.length === 0) return null;
        return {
          type: BITBUCKET_PUSH,
          payload: {
            branch: change?.new?.name,
            commitCount: commits.length,
            headMessage: commits[0]?.message?.split('\n')[0],
          },
        };
      }
      case 'pullrequest:created':
      case 'pullrequest:fulfilled':
      case 'pullrequest:rejected': {
        const pr = payload.pullrequest;
        if (!pr) return null;
        const base = {
          number: pr.id,
          title: pr.title,
          url: pr.links?.html?.href,
        };
        const type =
          eventKey === 'pullrequest:created'
            ? BITBUCKET_PR_OPENED
            : eventKey === 'pullrequest:fulfilled'
              ? BITBUCKET_PR_MERGED
              : BITBUCKET_PR_DECLINED;
        return { type, payload: base };
      }
      default:
        return null;
    }
  }
}

/**
 * Inbound Bitbucket Cloud webhooks. Bitbucket doesn't sign payloads — the
 * shared secret travels as a ?token= query param on the webhook URL;
 * constant-time compare, none configured means none accepted.
 */
@Controller('webhooks/bitbucket')
export class BitbucketWebhookController {
  private readonly logger = new Logger(BitbucketWebhookController.name);

  constructor(
    private readonly webhooks: BitbucketWebhookService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post()
  @HttpCode(202)
  async receive(
    @Body() payload: BitbucketPayload,
    @Headers('x-event-key') eventKey: string | undefined,
    @Query('token') token: string | undefined,
  ): Promise<{ status: string }> {
    const secret = this.config.get<string>('BITBUCKET_WEBHOOK_SECRET');
    if (!secret) {
      throw new ServiceUnavailableException(
        'Webhook secret not configured — run `relay up` after connecting Bitbucket.',
      );
    }
    if (!token || !safeEqual(token, secret)) {
      this.logger.warn('dropped webhook with missing/invalid token');
      throw new ForbiddenException('Invalid token.');
    }
    const status = await this.webhooks.handle(eventKey ?? 'unknown', payload);
    return { status };
  }
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
