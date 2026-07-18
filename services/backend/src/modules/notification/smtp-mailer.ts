import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import type { MailMessage, Mailer } from './mailer';

/**
 * SMTP adapter over nodemailer. Configured by a single SMTP_URL
 * (smtp[s]://user:pass@host:port, from the runtime secret smtp.url) plus an
 * optional SMTP_FROM. Called from the outbox path — errors are thrown so
 * delivery is retried with backoff.
 */
@Injectable()
export class SmtpMailer implements Mailer {
  private readonly logger = new Logger(SmtpMailer.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  private transport(): Transporter {
    if (!this.transporter) {
      this.transporter = createTransport(
        this.config.getOrThrow<string>('SMTP_URL'),
      );
    }
    return this.transporter;
  }

  async send(message: MailMessage): Promise<void> {
    const from = this.config.get<string>(
      'SMTP_FROM',
      'Relay <no-reply@relay.local>',
    );
    const info = (await this.transport().sendMail({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    })) as { messageId?: string };
    this.logger.log(
      `sent "${message.subject}" to ${message.to} (${info.messageId ?? 'no id'})`,
    );
  }
}
