import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type RelayDb } from '../../../database/drizzle.provider';
import { DomainEventBus } from '../../../events/domain-event-bus';
import {
  GITHUB_ISSUE_CLOSED,
  GITHUB_ISSUE_OPENED,
  GITHUB_PR_CLOSED,
  GITHUB_PR_MERGED,
  GITHUB_PR_OPENED,
  GITHUB_PUSH,
} from '../../../events/domain-event';
import { projects } from '../../project/project.schema';

/** The slice of GitHub webhook payloads Relay reads. Vendor shape stays here. */
interface GithubWebhookPayload {
  repository?: { full_name?: string };
  sender?: { login?: string };
  ref?: string;
  commits?: { message?: string }[];
  action?: string;
  pull_request?: {
    number?: number;
    title?: string;
    html_url?: string;
    merged?: boolean;
  };
  issue?: { number?: number; title?: string; html_url?: string };
}

/**
 * Normalizes GitHub webhooks into domain events (events.md: vendor payloads
 * never leak past the adapter). Events are attributed to the project whose
 * githubRepo matches; unmatched repos are ignored. The timeline ingests via
 * the firehose — capture is automatic, no journaling required.
 */
@Injectable()
export class GithubWebhookService {
  private readonly logger = new Logger(GithubWebhookService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: RelayDb,
    private readonly events: DomainEventBus,
  ) {}

  /** @returns what happened, for the HTTP response + logs. */
  async handle(eventName: string, payload: GithubWebhookPayload): Promise<string> {
    const repo = payload.repository?.full_name;
    if (!repo) return 'ignored: no repository in payload';

    const project = await this.db.query.projects.findFirst({
      where: eq(projects.githubRepo, repo),
      columns: { id: true, clientId: true },
    });
    if (!project) return `ignored: no project tracks ${repo}`;

    const normalized = this.normalize(eventName, payload);
    if (!normalized) return `ignored: unhandled event ${eventName}`;

    this.events.emit({
      type: normalized.type,
      projectId: project.id,
      clientId: project.clientId,
      actor: { kind: 'integration', id: 'github' },
      source: 'github',
      payload: { repo, author: payload.sender?.login ?? null, ...normalized.payload },
    });
    this.logger.log(`${normalized.type} on ${repo} → project ${project.id}`);
    return `recorded: ${normalized.type}`;
  }

  private normalize(
    eventName: string,
    payload: GithubWebhookPayload,
  ): { type: string; payload: Record<string, unknown> } | null {
    switch (eventName) {
      case 'push': {
        const commits = payload.commits ?? [];
        if (commits.length === 0) return null; // branch deletes, tags
        return {
          type: GITHUB_PUSH,
          payload: {
            branch: payload.ref?.replace('refs/heads/', ''),
            commitCount: commits.length,
            headMessage: commits[commits.length - 1]?.message?.split('\n')[0],
          },
        };
      }
      case 'pull_request': {
        const pr = payload.pull_request;
        if (!pr) return null;
        const base = {
          number: pr.number,
          title: pr.title,
          url: pr.html_url,
        };
        if (payload.action === 'opened') {
          return { type: GITHUB_PR_OPENED, payload: base };
        }
        if (payload.action === 'closed') {
          return {
            type: pr.merged ? GITHUB_PR_MERGED : GITHUB_PR_CLOSED,
            payload: base,
          };
        }
        return null;
      }
      case 'issues': {
        const issue = payload.issue;
        if (!issue) return null;
        const base = {
          number: issue.number,
          title: issue.title,
          url: issue.html_url,
        };
        if (payload.action === 'opened') {
          return { type: GITHUB_ISSUE_OPENED, payload: base };
        }
        if (payload.action === 'closed') {
          return { type: GITHUB_ISSUE_CLOSED, payload: base };
        }
        return null;
      }
      default:
        return null;
    }
  }
}
