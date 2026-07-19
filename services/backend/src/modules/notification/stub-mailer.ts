import { Injectable, Logger } from '@nestjs/common';
import type { MailMessage, Mailer } from './mailer';

/** Logs instead of sending — dev/test without an SMTP server. */
@Injectable()
export class StubMailer implements Mailer {
  private readonly logger = new Logger(StubMailer.name);

  async send(message: MailMessage): Promise<void> {
    // Full text: sign-in and approval links must be copyable from the logs
    // when no SMTP server is configured (local dev, demos).
    this.logger.log(
      `[stub] would send "${message.subject}" to ${message.to}:\n${message.text}`,
    );
  }
}
