import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  APPROVAL_DECIDED,
  type ApprovalDecidedEvent,
} from '../approval/approval.events';
import { MeetingService } from './meeting.service';

/**
 * Reacts to a client's approval decision. This is the event-driven seam
 * between the approval and meeting modules — approval never calls meeting
 * directly (`events.md`: services publish events instead of invoking each
 * other).
 */
@Injectable()
export class MeetingApprovalHandler {
  private readonly logger = new Logger(MeetingApprovalHandler.name);

  constructor(private readonly meetings: MeetingService) {}

  @OnEvent(APPROVAL_DECIDED)
  async handleApprovalDecided(event: ApprovalDecidedEvent): Promise<void> {
    try {
      await this.meetings.applyDecision(
        event.meetingId,
        event.decision,
        event.comment,
      );
    } catch (error) {
      this.logger.error(
        `Failed to apply approval decision for meeting ${event.meetingId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
