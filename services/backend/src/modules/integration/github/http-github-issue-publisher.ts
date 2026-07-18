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
      // Draft assignees are transcript NAMES ("Jay Emp0"), not GitHub
      // usernames — only username-shaped values go in the assignees field;
      // everything else is noted in the body instead of 422ing the issue.
      const usernameLike =
        issue.assignee && /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})$/.test(issue.assignee)
          ? issue.assignee
          : null;
      const bodyWithAssignee =
        issue.assignee && !usernameLike
          ? `${issue.body}\n\n_Intended assignee: ${issue.assignee}_`
          : issue.body;

      let data = await this.create(repo, token, {
        title: issue.title,
        body: bodyWithAssignee,
        ...(usernameLike ? { assignees: [usernameLike] } : {}),
      });

      // The name may still not be an assignable collaborator: retry once
      // without the assignee rather than failing the whole publish.
      if (data === 'invalid-assignee' && usernameLike) {
        this.logger.warn(
          `"${usernameLike}" is not assignable on ${repo} — creating without assignee.`,
        );
        data = await this.create(repo, token, {
          title: issue.title,
          body: `${issue.body}\n\n_Intended assignee: ${usernameLike}_`,
        });
      }
      if (data === 'invalid-assignee') {
        throw new Error(`GitHub rejected the issue for ${repo} (assignee validation).`);
      }

      this.logger.log(`Created ${repo}#${data.number} — "${issue.title}"`);
      published.push({ title: issue.title, url: data.html_url });
    }

    return published;
  }

  private async create(
    repo: string,
    token: string,
    payload: { title: string; body: string; assignees?: string[] },
  ): Promise<GithubIssueResponse | 'invalid-assignee'> {
    const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        'user-agent': 'relay-backend',
        'x-github-api-version': '2022-11-28',
      },
      body: JSON.stringify(payload),
    });
    if (res.status === 422) {
      const detail = await res.text().catch(() => '');
      if (detail.includes('"field":"assignees"')) return 'invalid-assignee';
      throw new Error(
        `GitHub issue create failed for ${repo} (HTTP 422): ${detail.slice(0, 300)}`,
      );
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(
        `GitHub issue create failed for ${repo} (HTTP ${res.status}): ${detail.slice(0, 300)}`,
      );
    }
    return (await res.json()) as GithubIssueResponse;
  }
}
