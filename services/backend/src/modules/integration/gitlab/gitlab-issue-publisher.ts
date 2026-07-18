import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  GithubIssuePublisher,
  IssueInput,
  PublishedIssue,
} from '../github/github-issue-publisher';

interface GitlabIssueResponse {
  web_url: string;
  iid: number;
}

/**
 * GitLab issue adapter (REST v4, plain fetch). Self-hosted instances via
 * GITLAB_BASE_URL. Called from the outbox path — throw loudly, retry follows.
 */
@Injectable()
export class GitlabIssuePublisher implements GithubIssuePublisher {
  private readonly logger = new Logger(GitlabIssuePublisher.name);

  constructor(private readonly config: ConfigService) {}

  async publishIssues(
    repo: string,
    issues: IssueInput[],
  ): Promise<PublishedIssue[]> {
    const token = this.config.get<string>('GITLAB_TOKEN');
    if (!token) {
      throw new Error('GitLab is not connected (no GITLAB_TOKEN).');
    }
    const base = (
      this.config.get<string>('GITLAB_BASE_URL') || 'https://gitlab.com'
    ).replace(/\/$/, '');
    const project = encodeURIComponent(repo);
    const published: PublishedIssue[] = [];

    for (const issue of issues) {
      const res = await fetch(`${base}/api/v4/projects/${project}/issues`, {
        method: 'POST',
        headers: {
          'private-token': token,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ title: issue.title, description: issue.body }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(
          `GitLab issue create failed for ${repo} (HTTP ${res.status}): ${detail.slice(0, 300)}`,
        );
      }
      const data = (await res.json()) as GitlabIssueResponse;
      this.logger.log(`Created ${repo}#${data.iid} — "${issue.title}"`);
      published.push({ title: issue.title, url: data.web_url });
    }
    return published;
  }
}
