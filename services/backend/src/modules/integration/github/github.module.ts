import { Module } from '@nestjs/common';
import { GITHUB_ISSUE_PUBLISHER } from './github-issue-publisher';
import { StubGithubIssuePublisher } from './stub-github-issue-publisher';

@Module({
  providers: [
    { provide: GITHUB_ISSUE_PUBLISHER, useClass: StubGithubIssuePublisher },
  ],
  exports: [GITHUB_ISSUE_PUBLISHER],
})
export class GithubModule {}
