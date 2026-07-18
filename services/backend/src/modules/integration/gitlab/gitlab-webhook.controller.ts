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
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type RelayDb } from '../../../database/drizzle.provider';
import { DomainEventBus } from '../../../events/domain-event-bus';
import {
  GITLAB_ISSUE_CLOSED,
  GITLAB_ISSUE_OPENED,
  GITLAB_MR_CLOSED,
  GITLAB_MR_MERGED,
  GITLAB_MR_OPENED,
  GITLAB_PUSH,
} from '../../../events/domain-event';
import { Public } from '../../auth/public.decorator';
import { projects } from '../../project/project.schema';

/** The slice of GitLab webhook payloads Relay reads. */
interface GitlabPayload {
  project?: { path_with_namespace?: string };
  user_username?: string;
  user?: { username?: string };
  ref?: string;
  commits?: { message?: string }[];
  total_commits_count?: number;
  object_attributes?: {
    iid?: number;
    title?: string;
    url?: string;
    action?: string;
  };
}

@Injectable()
export class GitlabWebhookService {
  private readonly logger = new Logger(GitlabWebhookService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: RelayDb,
    private readonly events: DomainEventBus,
  ) {}

  async handle(eventName: string, payload: GitlabPayload): Promise<string> {
    const path = payload.project?.path_with_namespace;
    if (!path) return 'ignored: no project in payload';

    const project = await this.db.query.projects.findFirst({
      where: eq(projects.githubRepo, `gitlab:${path}`),
      columns: { id: true, clientId: true },
    });
    if (!project) return `ignored: no project tracks gitlab:${path}`;

    const normalized = this.normalize(eventName, payload);
    if (!normalized) return `ignored: unhandled event ${eventName}`;

    this.events.emit({
      type: normalized.type,
      projectId: project.id,
      clientId: project.clientId,
      actor: { kind: 'integration', id: 'gitlab' },
      source: 'gitlab',
      payload: {
        repo: path,
        author: payload.user_username ?? payload.user?.username ?? null,
        ...normalized.payload,
      },
    });
    this.logger.log(`${normalized.type} on ${path} → project ${project.id}`);
    return `recorded: ${normalized.type}`;
  }

  private normalize(
    eventName: string,
    payload: GitlabPayload,
  ): { type: string; payload: Record<string, unknown> } | null {
    const attrs = payload.object_attributes;
    switch (eventName) {
      case 'Push Hook': {
        const commits = payload.commits ?? [];
        if (commits.length === 0) return null;
        return {
          type: GITLAB_PUSH,
          payload: {
            branch: payload.ref?.replace('refs/heads/', ''),
            commitCount: payload.total_commits_count ?? commits.length,
            headMessage: commits[commits.length - 1]?.message?.split('\n')[0],
          },
        };
      }
      case 'Merge Request Hook': {
        if (!attrs) return null;
        const base = { number: attrs.iid, title: attrs.title, url: attrs.url };
        if (attrs.action === 'open') return { type: GITLAB_MR_OPENED, payload: base };
        if (attrs.action === 'merge') return { type: GITLAB_MR_MERGED, payload: base };
        if (attrs.action === 'close') return { type: GITLAB_MR_CLOSED, payload: base };
        return null;
      }
      case 'Issue Hook': {
        if (!attrs) return null;
        const base = { number: attrs.iid, title: attrs.title, url: attrs.url };
        if (attrs.action === 'open') return { type: GITLAB_ISSUE_OPENED, payload: base };
        if (attrs.action === 'close') return { type: GITLAB_ISSUE_CLOSED, payload: base };
        return null;
      }
      default:
        return null;
    }
  }
}

/**
 * Inbound GitLab webhooks. GitLab sends the shared secret verbatim in
 * X-Gitlab-Token (no HMAC) — constant-time compare; no secret configured
 * means no webhooks accepted.
 */
@Controller('webhooks/gitlab')
export class GitlabWebhookController {
  private readonly logger = new Logger(GitlabWebhookController.name);

  constructor(
    private readonly webhooks: GitlabWebhookService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post()
  @HttpCode(202)
  async receive(
    @Body() payload: GitlabPayload,
    @Headers('x-gitlab-event') eventName: string | undefined,
    @Headers('x-gitlab-token') token: string | undefined,
  ): Promise<{ status: string }> {
    const secret = this.config.get<string>('GITLAB_WEBHOOK_SECRET');
    if (!secret) {
      throw new ServiceUnavailableException(
        'Webhook secret not configured — run `relay up` after connecting GitLab.',
      );
    }
    if (!token || !safeEqual(token, secret)) {
      this.logger.warn('dropped webhook with missing/invalid token');
      throw new ForbiddenException('Invalid token.');
    }
    const status = await this.webhooks.handle(eventName ?? 'unknown', payload);
    return { status };
  }
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
