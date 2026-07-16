import { Injectable, Logger } from '@nestjs/common';
import {
  GithubIssuePublisher,
  IssueInput,
  PublishedIssue,
} from './github-issue-publisher';

/**
 * Logs what it would push and returns plausible issue URLs. No network calls.
 * Replace with an Octokit-backed adapter once the loop is validated.
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
        url: `https://github.com/${repo}/issues/${fakeNumber}`,
      };
    });

    return Promise.resolve(published);
  }
}
