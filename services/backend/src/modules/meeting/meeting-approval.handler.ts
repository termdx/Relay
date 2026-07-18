import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  APPROVAL_DECIDED,
  type ApprovalDecidedEvent,
} from '../approval/approval.events';
import { OutboxService } from '../outbox/outbox.service';
import { MeetingService } from './meeting.service';

/**
 * Applies a client's approval decision — delivered via the transactional
 * outbox, so a transient failure (e.g. GitHub down) is retried with backoff
 * instead of stranding the meeting. Errors are RETHROWN on purpose: the
 * outbox owns retry; swallowing here would mark the message DONE.
 * `applyDecision` is idempotent, so redelivery is safe.
 */
@Injectable()
export class MeetingApprovalHandler implements OnModuleInit {
  constructor(
    private readonly meetings: MeetingService,
    private readonly outbox: OutboxService,
  ) {}

  onModuleInit(): void {
    this.outbox.register(APPROVAL_DECIDED, async (payload) => {
      const event = payload as unknown as ApprovalDecidedEvent;
      await this.meetings.applyDecision(
        event.meetingId,
        event.decision,
        event.comment,
      );
    });
  }
}
