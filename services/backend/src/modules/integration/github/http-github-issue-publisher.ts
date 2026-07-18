import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  GithubIssuePublisher,
  IssueInput,
  PublishedIssue,
} from './github-issue-publisher';

interface GithubIssueResponse {
  html_url: string;
  number: number;
}

/**
 * The real GitHub adapter: plain REST via fetch, no SDK dependency.
 * Called from the outbox path, so a thrown error is retried with backoff —
 * fail loudly, never partially-succeed silently. Issues are created
 * sequentially to keep retry semantics simple (the caller skips tasks that
 * already have a URL).
 */
@Injectable()
export class HttpGithubIssuePublisher implements GithubIssuePublisher {
  private readonly logger = new Logger(HttpGithubIssuePublisher.name);

  constructor(private readonly config: ConfigService) {}

  async publishIssues(
    repo: string,
    issues: IssueInput[],
  ): Promise<PublishedIssue[]> {
    const token = this.config.getOrThrow<string>('GITHUB_TOKEN');
    const published: PublishedIssue[] = [];

    for (const issue of issues) {
      const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/vnd.github+json',
          'content-type': 'application/json',
          'user-agent': 'relay-backend',
          'x-github-api-version': '2022-11-28',
        },
        body: JSON.stringify({
          title: issue.title,
          body: issue.body,
          ...(issue.assignee ? { assignees: [issue.assignee] } : {}),
        }),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(
          `GitHub issue create failed for ${repo} (HTTP ${res.status}): ${detail.slice(0, 300)}`,
        );
      }

      const data = (await res.json()) as GithubIssueResponse;
      this.logger.log(`Created ${repo}#${data.number} — "${issue.title}"`);
      published.push({ title: issue.title, url: data.html_url });
    }

    return published;
  }
}
