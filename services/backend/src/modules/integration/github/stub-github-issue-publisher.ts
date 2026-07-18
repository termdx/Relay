import { Injectable, Logger } from '@nestjs/common';
import {
  GithubIssuePublisher,
  IssueInput,
  PublishedIssue,
} from './github-issue-publisher';

/**
 * Logs what it would push. No network calls. The returned URLs use the
 * reserved `.invalid` TLD (RFC 2606) on purpose: a simulated issue must
 * never look like a real github.com link — clicking one should obviously
 * fail, not land on somebody's unrelated issue #1.
 */
@Injectable()
export class StubGithubIssuePublisher implements GithubIssuePublisher {
  private readonly logger = new Logger(StubGithubIssuePublisher.name);

  publishIssues(
    repo: string,
    issues: IssueInput[],
  ): Promise<PublishedIssue[]> {
    this.logger.warn(
      `Using StubGithubIssuePublisher — no issues actually created on ${repo}.`,
    );

    const published = issues.map((issue, index) => {
      const fakeNumber = index + 1;
      this.logger.log(`[stub] would create issue "${issue.title}" on ${repo}`);
      return {
        title: issue.title,
        url: `https://simulated.github.invalid/${repo}/issues/${fakeNumber}`,
      };
    });

    return Promise.resolve(published);
  }
}
