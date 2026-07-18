import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatNotifier } from './chat-notifier';
import { MAILER } from './mailer';
import { NotificationService } from './notification.service';
import { SmtpMailer } from './smtp-mailer';
import { StubMailer } from './stub-mailer';

/**
 * Adapter selection is config, not code: an SMTP_URL selects the real
 * nodemailer transport; without one the stub logs. The URL reaches the env
 * via the runtime's secret store (smtp.url) or plain env in dev.
 */
@Module({
  providers: [
    SmtpMailer,
    StubMailer,
    ChatNotifier,
    NotificationService,
    {
      provide: MAILER,
      inject: [ConfigService, SmtpMailer, StubMailer],
      useFactory: (config: ConfigService, smtp: SmtpMailer, stub: StubMailer) => {
        const hasSmtp = Boolean(config.get<string>('SMTP_URL'));
        new Logger('NotificationModule').log(
          hasSmtp ? 'Mailer: SMTP (url present)' : 'Mailer: stub (no SMTP_URL)',
        );
        return hasSmtp ? smtp : stub;
      },
    },
  ],
  exports: [MAILER, ChatNotifier],
})
export class NotificationModule {}
