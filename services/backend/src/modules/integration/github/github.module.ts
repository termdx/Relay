import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BitbucketIssuePublisher } from '../bitbucket/bitbucket-issue-publisher';
import {
  BitbucketWebhookController,
  BitbucketWebhookService,
} from '../bitbucket/bitbucket-webhook.controller';
import { CompositeIssuePublisher } from '../composite-issue-publisher';
import { GitlabIssuePublisher } from '../gitlab/gitlab-issue-publisher';
import {
  GitlabWebhookController,
  GitlabWebhookService,
} from '../gitlab/gitlab-webhook.controller';
import { GITHUB_ISSUE_PUBLISHER } from './github-issue-publisher';
import { GithubWebhookController } from './github-webhook.controller';
import { GithubWebhookService } from './github-webhook.service';
import { HttpGithubIssuePublisher } from './http-github-issue-publisher';
import { StubGithubIssuePublisher } from './stub-github-issue-publisher';

/**
 * The issue-tracker integrations: GitHub, GitLab, Bitbucket — one port,
 * provider routed by the repo's prefix (integrations.md). Webhook receivers
 * for all three normalize inbound events onto the timeline.
 */
@Module({
  controllers: [
    GithubWebhookController,
    GitlabWebhookController,
    BitbucketWebhookController,
  ],
  providers: [
    GithubWebhookService,
    GitlabWebhookService,
    BitbucketWebhookService,
    HttpGithubIssuePublisher,
    StubGithubIssuePublisher,
    GitlabIssuePublisher,
    BitbucketIssuePublisher,
    CompositeIssuePublisher,
    {
      provide: GITHUB_ISSUE_PUBLISHER,
      inject: [ConfigService, CompositeIssuePublisher],
      useFactory: (config: ConfigService, composite: CompositeIssuePublisher) => {
        const connected = [
          config.get('GITHUB_TOKEN') && 'github',
          config.get('GITLAB_TOKEN') && 'gitlab',
          config.get('BITBUCKET_TOKEN') && 'bitbucket',
        ].filter(Boolean);
        new Logger('TrackerModule').log(
          connected.length > 0
            ? `Issue trackers connected: ${connected.join(', ')}`
            : 'No issue tracker connected — GitHub stub active.',
        );
        return composite;
      },
    },
  ],
  exports: [GITHUB_ISSUE_PUBLISHER],
})
export class GithubModule {}
