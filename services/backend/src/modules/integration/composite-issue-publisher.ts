import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  GithubIssuePublisher,
  IssueInput,
  PublishedIssue,
} from './github/github-issue-publisher';
import { HttpGithubIssuePublisher } from './github/http-github-issue-publisher';
import { StubGithubIssuePublisher } from './github/stub-github-issue-publisher';
import { GitlabIssuePublisher } from './gitlab/gitlab-issue-publisher';
import { BitbucketIssuePublisher } from './bitbucket/bitbucket-issue-publisher';

/** "gitlab:group/project" → { provider: 'gitlab', path: 'group/project' } */
export function parseRepo(repo: string): { provider: string; path: string } {
  const match = /^(github|gitlab|bitbucket):(.+)$/.exec(repo);
  if (match) return { provider: match[1]!, path: match[2]! };
  return { provider: 'github', path: repo };
}

/**
 * Routes issue publishing to the tracker named by the repo's provider prefix
 * (plain "owner/repo" stays GitHub). Callers keep depending on the same port;
 * multi-tracker support is a repo-string concern, not a caller concern.
 */
@Injectable()
export class CompositeIssuePublisher implements GithubIssuePublisher {
  private readonly logger = new Logger(CompositeIssuePublisher.name);

  constructor(
    private readonly config: ConfigService,
    private readonly github: HttpGithubIssuePublisher,
    private readonly githubStub: StubGithubIssuePublisher,
    private readonly gitlab: GitlabIssuePublisher,
    private readonly bitbucket: BitbucketIssuePublisher,
  ) {}

  publishIssues(
    repo: string,
    issues: IssueInput[],
  ): Promise<PublishedIssue[]> {
    const { provider, path } = parseRepo(repo);
    switch (provider) {
      case 'gitlab':
        return this.gitlab.publishIssues(path, issues);
      case 'bitbucket':
        return this.bitbucket.publishIssues(path, issues);
      default: {
        // GitHub keeps its offline stub when no token is connected.
        if (this.config.get<string>('GITHUB_TOKEN')) {
          return this.github.publishIssues(path, issues);
        }
        this.logger.warn('GitHub not connected — using stub publisher.');
        return this.githubStub.publishIssues(path, issues);
      }
    }
  }
}
