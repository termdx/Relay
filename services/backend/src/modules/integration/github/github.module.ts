import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GITHUB_ISSUE_PUBLISHER } from './github-issue-publisher';
import { HttpGithubIssuePublisher } from './http-github-issue-publisher';
import { StubGithubIssuePublisher } from './stub-github-issue-publisher';

/**
 * Adapter selection is config, not code (integrations.md): a GITHUB_TOKEN
 * selects the real REST adapter; without one the stub keeps every flow
 * working offline. The token reaches the env via the runtime's secret store
 * (github.token) or plain env in dev.
 */
@Module({
  providers: [
    HttpGithubIssuePublisher,
    StubGithubIssuePublisher,
    {
      provide: GITHUB_ISSUE_PUBLISHER,
      inject: [ConfigService, HttpGithubIssuePublisher, StubGithubIssuePublisher],
      useFactory: (
        config: ConfigService,
        http: HttpGithubIssuePublisher,
        stub: StubGithubIssuePublisher,
      ) => {
        const hasToken = Boolean(config.get<string>('GITHUB_TOKEN'));
        new Logger('GithubModule').log(
          hasToken
            ? 'GitHub adapter: real (token present)'
            : 'GitHub adapter: stub (no GITHUB_TOKEN)',
        );
        return hasToken ? http : stub;
      },
    },
  ],
  exports: [GITHUB_ISSUE_PUBLISHER],
})
export class GithubModule {}
