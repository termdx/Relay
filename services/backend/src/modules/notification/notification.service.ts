import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { DomainEventBus } from '../../events/domain-event-bus';
import { NOTIFICATION_SENT } from '../../events/domain-event';
import { OutboxService } from '../outbox/outbox.service';
import {
  PORTAL_LOGIN_EMAIL,
  type PortalLoginEmailPayload,
} from '../portal/portal-auth.service';
import { MAILER, type Mailer } from './mailer';

/** Outbox message type: a client should receive an approval request email. */
export const APPROVAL_EMAIL_REQUESTED = 'notification.approval_email';

export interface ApprovalEmailPayload {
  meetingId: string;
  projectId: string | null;
  clientEmail: string;
  meetingTitle: string;
  approvalUrl: string;
}

/**
 * Sends outbound notifications. Consumes durable outbox messages (an email is
 * an external side effect — it gets retry like any other) and emits
 * notification.sent onto the timeline once delivered.
 */
@Injectable()
export class NotificationService implements OnModuleInit {
  constructor(
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly outbox: OutboxService,
    private readonly events: DomainEventBus,
  ) {}

  onModuleInit(): void {
    this.outbox.register(APPROVAL_EMAIL_REQUESTED, async (payload) => {
      const email = payload as unknown as ApprovalEmailPayload;
      await this.sendApprovalEmail(email);
    });
    this.outbox.register(PORTAL_LOGIN_EMAIL, async (payload) => {
      const login = payload as unknown as PortalLoginEmailPayload;
      await this.mailer.send({
        to: login.clientEmail,
        subject: 'Your sign-in link',
        text: [
          `Hi ${login.clientName},`,
          ``,
          `Sign in to your project portal here (link valid for 15 minutes):`,
          login.loginUrl,
          ``,
          `— sent by Relay`,
        ].join('\n'),
        html: [
          `<p>Hi ${escapeHtml(login.clientName)},</p>`,
          `<p><a href="${login.loginUrl}">Sign in to your project portal</a> (valid for 15 minutes).</p>`,
          `<p style="color:#888">— sent by Relay</p>`,
        ].join('\n'),
      });
    });
  }

  private async sendApprovalEmail(email: ApprovalEmailPayload): Promise<void> {
    await this.mailer.send({
      to: email.clientEmail,
      subject: `Please review: ${email.meetingTitle}`,
      text: [
        `Hi,`,
        ``,
        `A summary and proposed next steps from "${email.meetingTitle}" are ready for your review.`,
        ``,
        `Review and approve here: ${email.approvalUrl}`,
        ``,
        `— sent by Relay`,
      ].join('\n'),
      html: [
        `<p>Hi,</p>`,
        `<p>A summary and proposed next steps from <strong>${escapeHtml(email.meetingTitle)}</strong> are ready for your review.</p>`,
        `<p><a href="${email.approvalUrl}">Review and approve</a></p>`,
        `<p style="color:#888">— sent by Relay</p>`,
      ].join('\n'),
    });

    this.events.emit({
      type: NOTIFICATION_SENT,
      projectId: email.projectId ?? undefined,
      actor: { kind: 'system' },
      source: 'notification',
      payload: {
        channel: 'email',
        to: email.clientEmail,
        subject: `Please review: ${email.meetingTitle}`,
        meetingId: email.meetingId,
      },
    });
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
