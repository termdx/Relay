import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  GithubIssuePublisher,
  IssueInput,
  PublishedIssue,
} from '../github/github-issue-publisher';

interface BitbucketIssueResponse {
  id: number;
  links?: { html?: { href?: string } };
}

/**
 * Bitbucket Cloud issue adapter (API 2.0, repository access token). Called
 * from the outbox path — throw loudly, retry follows.
 */
@Injectable()
export class BitbucketIssuePublisher implements GithubIssuePublisher {
  private readonly logger = new Logger(BitbucketIssuePublisher.name);

  constructor(private readonly config: ConfigService) {}

  async publishIssues(
    repo: string,
    issues: IssueInput[],
  ): Promise<PublishedIssue[]> {
    const token = this.config.get<string>('BITBUCKET_TOKEN');
    if (!token) {
      throw new Error('Bitbucket is not connected (no BITBUCKET_TOKEN).');
    }
    const published: PublishedIssue[] = [];

    for (const issue of issues) {
      const res = await fetch(
        `https://api.bitbucket.org/2.0/repositories/${repo}/issues`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            title: issue.title,
            content: { raw: issue.body },
          }),
        },
      );
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(
          `Bitbucket issue create failed for ${repo} (HTTP ${res.status}): ${detail.slice(0, 300)}`,
        );
      }
      const data = (await res.json()) as BitbucketIssueResponse;
      const url =
        data.links?.html?.href ??
        `https://bitbucket.org/${repo}/issues/${data.id}`;
      this.logger.log(`Created ${repo}#${data.id} — "${issue.title}"`);
      published.push({ title: issue.title, url });
    }
    return published;
  }
}
