import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, type RelayDb } from '../../database/drizzle.provider';
import { APPROVAL_DECIDED, type ApprovalDecidedEvent } from './approval.events';
import {
  approvals,
  type Approval,
  type ApprovalPayload,
  type ApprovalStatus,
} from './approval.schema';

@Injectable()
export class ApprovalService {
  private readonly logger = new Logger(ApprovalService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: RelayDb,
    private readonly events: EventEmitter2,
  ) {}

  /** Create a pending approval for a meeting and return it (token included). */
  async createForMeeting(
    meetingId: string,
    payload: ApprovalPayload,
  ): Promise<Approval> {
    const [approval] = await this.db
      .insert(approvals)
      .values({
        meetingId,
        token: randomBytes(24).toString('base64url'),
        status: 'PENDING',
        payload,
      })
      .returning();
    return approval!;
  }

  async getByToken(token: string): Promise<Approval> {
    const approval = await this.db.query.approvals.findFirst({
      where: eq(approvals.token, token),
    });
    if (!approval) {
      throw new NotFoundException('Approval link is invalid or has expired.');
    }
    return approval;
  }

  /**
   * Record a client's decision. A second response to an already-decided
   * approval is rejected rather than silently overwritten — enforced in the
   * UPDATE's WHERE clause, so concurrent submits cannot both win.
   */
  async respond(
    token: string,
    decision: Exclude<ApprovalStatus, 'PENDING'>,
    comment: string | null,
  ): Promise<Approval> {
    const [updated] = await this.db
      .update(approvals)
      .set({ status: decision, clientComment: comment, respondedAt: new Date() })
      .where(and(eq(approvals.token, token), eq(approvals.status, 'PENDING')))
      .returning();

    if (!updated) {
      // Either the token is unknown (404) or it was already decided.
      const existing = await this.getByToken(token);
      this.logger.warn(
        `Approval ${existing.id} already decided (${existing.status}); ignoring repeat response.`,
      );
      return existing;
    }

    const event: ApprovalDecidedEvent = {
      meetingId: updated.meetingId,
      approvalId: updated.id,
      decision,
      comment,
    };
    this.events.emit(APPROVAL_DECIDED, event);

    return updated;
  }
}
