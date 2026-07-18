import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Chat sinks (Notifier port, integrations.md): Slack and Discord incoming
 * webhooks. Fan-out sends to every configured sink; a failure throws so the
 * outbox retries the whole message (sinks are idempotent enough — a rare
 * duplicate chat line beats a silently lost one).
 */
@Injectable()
export class ChatNotifier {
  private readonly logger = new Logger(ChatNotifier.name);

  constructor(private readonly config: ConfigService) {}

  /** Which sinks are configured right now (drives whether fan-out enqueues). */
  hasSinks(): boolean {
    return Boolean(
      this.config.get<string>('SLACK_WEBHOOK_URL') ||
        this.config.get<string>('DISCORD_WEBHOOK_URL'),
    );
  }

  async send(text: string): Promise<void> {
    const slack = this.config.get<string>('SLACK_WEBHOOK_URL');
    const discord = this.config.get<string>('DISCORD_WEBHOOK_URL');

    if (slack) {
      await this.post(slack, { text }, 'slack');
    }
    if (discord) {
      await this.post(discord, { content: text }, 'discord');
    }
  }

  private async post(
    url: string,
    body: Record<string, string>,
    sink: string,
  ): Promise<void> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(
        `${sink} webhook failed (HTTP ${res.status}): ${detail.slice(0, 200)}`,
      );
    }
    this.logger.log(`sent to ${sink}`);
  }
}
