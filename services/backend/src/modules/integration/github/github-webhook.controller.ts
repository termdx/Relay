import {
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
  type RawBodyRequest,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { Public } from '../../auth/public.decorator';
import { GithubWebhookService } from './github-webhook.service';
import { verifyGithubSignature } from './github-webhook.verifier';

/**
 * Inbound GitHub webhooks. Public route (GitHub calls it), but every payload
 * must carry a valid HMAC signature — unverifiable payloads are dropped and
 * logged (security.md). No secret configured means no webhooks accepted.
 */
@Controller('webhooks/github')
export class GithubWebhookController {
  private readonly logger = new Logger(GithubWebhookController.name);

  constructor(
    private readonly webhooks: GithubWebhookService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post()
  @HttpCode(202)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-github-event') eventName: string | undefined,
    @Headers('x-hub-signature-256') signature: string | undefined,
  ): Promise<{ status: string }> {
    const secret = this.config.get<string>('GITHUB_WEBHOOK_SECRET');
    if (!secret) {
      throw new ServiceUnavailableException(
        'Webhook secret not configured — run `relay up` after connecting GitHub.',
      );
    }
    if (!req.rawBody || !verifyGithubSignature(secret, req.rawBody, signature)) {
      this.logger.warn('dropped webhook with missing/invalid signature');
      throw new ForbiddenException('Invalid signature.');
    }

    const status = await this.webhooks.handle(
      eventName ?? 'unknown',
      (req.body ?? {}) as Parameters<GithubWebhookService['handle']>[1],
    );
    return { status };
  }
}
