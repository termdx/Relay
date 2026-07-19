import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import {
  DRIZZLE,
  type RelayDb,
  type RelayTx,
} from '../../database/drizzle.provider';
import { OutboxService } from '../outbox/outbox.service';
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
    private readonly outbox: OutboxService,
  ) {}

  /** Create a pending approval for a meeting and return it (token included).
   * Accepts the caller's transaction so approval + status + notification can
   * commit atomically. */
  async createForMeeting(
    meetingId: string,
    payload: ApprovalPayload,
    db: RelayDb | RelayTx = this.db,
  ): Promise<Approval> {
    const [approval] = await db
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

  /** Latest still-pending approval for a meeting, if one exists. */
  async findPendingForMeeting(meetingId: string): Promise<Approval | undefined> {
    return this.db.query.approvals.findFirst({
      where: and(
        eq(approvals.meetingId, meetingId),
        eq(approvals.status, 'PENDING'),
      ),
      orderBy: (a, { desc }) => [desc(a.createdAt)],
    });
  }

  /**
   * Record a client's decision. A second response to an already-decided
   * approval is rejected rather than silently overwritten — enforced in the
   * UPDATE's WHERE clause, so concurrent submits cannot both win.
   *
   * The follow-up work (publish issues, notify) is enqueued on the outbox in
   * the SAME transaction as the decision: either both persist or neither —
   * the decision can never land without its side effects being owed.
   */
  async respond(
    token: string,
    decision: Exclude<ApprovalStatus, 'PENDING'>,
    comment: string | null,
  ): Promise<Approval> {
    const updated = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(approvals)
        .set({
          status: decision,
          clientComment: comment,
          respondedAt: new Date(),
        })
        .where(and(eq(approvals.token, token), eq(approvals.status, 'PENDING')))
        .returning();
      if (!row) return undefined;

      const event: ApprovalDecidedEvent = {
        meetingId: row.meetingId,
        approvalId: row.id,
        decision,
        comment,
      };
      await this.outbox.enqueue(tx, APPROVAL_DECIDED, { ...event });
      return row;
    });

    if (!updated) {
      // Either the token is unknown (404) or it was already decided.
      const existing = await this.getByToken(token);
      this.logger.warn(
        `Approval ${existing.id} already decided (${existing.status}); ignoring repeat response.`,
      );
      return existing;
    }

    return updated;
  }
}
