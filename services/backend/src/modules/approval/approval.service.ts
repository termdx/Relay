import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { Repository } from 'typeorm';
import {
  APPROVAL_DECIDED,
  ApprovalDecidedEvent,
} from './approval.events';
import {
  Approval,
  ApprovalPayload,
  ApprovalStatus,
} from './entities/approval.entity';

@Injectable()
export class ApprovalService {
  private readonly logger = new Logger(ApprovalService.name);

  constructor(
    @InjectRepository(Approval)
    private readonly approvals: Repository<Approval>,
    private readonly events: EventEmitter2,
  ) {}

  /** Create a pending approval for a meeting and return it (token included). */
  async createForMeeting(
    meetingId: string,
    payload: ApprovalPayload,
  ): Promise<Approval> {
    const approval = this.approvals.create({
      meetingId,
      token: randomBytes(24).toString('base64url'),
      status: 'PENDING',
      payload,
      clientComment: null,
      respondedAt: null,
    });
    return this.approvals.save(approval);
  }

  async getByToken(token: string): Promise<Approval> {
    const approval = await this.approvals.findOne({ where: { token } });
    if (!approval) {
      throw new NotFoundException('Approval link is invalid or has expired.');
    }
    return approval;
  }

  /**
   * Record a client's decision. Idempotent-safe: a second response to an
   * already-decided approval is rejected rather than silently overwritten.
   */
  async respond(
    token: string,
    decision: Exclude<ApprovalStatus, 'PENDING'>,
    comment: string | null,
  ): Promise<Approval> {
    const approval = await this.getByToken(token);

    if (approval.status !== 'PENDING') {
      this.logger.warn(
        `Approval ${approval.id} already decided (${approval.status}); ignoring repeat response.`,
      );
      return approval;
    }

    approval.status = decision;
    approval.clientComment = comment;
    approval.respondedAt = new Date();
    const saved = await this.approvals.save(approval);

    const event: ApprovalDecidedEvent = {
      meetingId: saved.meetingId,
      approvalId: saved.id,
      decision,
      comment,
    };
    this.events.emit(APPROVAL_DECIDED, event);

    return saved;
  }
}
