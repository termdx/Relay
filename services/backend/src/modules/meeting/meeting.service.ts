import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { asc, desc, eq } from 'drizzle-orm';
import { DRIZZLE, type RelayDb } from '../../database/drizzle.provider';
import { ApprovalService } from '../approval/approval.service';
import { DRAFT_GENERATOR, type DraftGenerator } from '../ai/draft-generator';
import {
  GITHUB_ISSUE_PUBLISHER,
  type GithubIssuePublisher,
} from '../integration/github/github-issue-publisher';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDraftDto } from './dto/update-meeting-draft.dto';
import {
  meetingTasks,
  meetings,
  type MeetingStatus,
  type MeetingWithTasks,
} from './meeting.schema';

/** Statuses from which the founder may still edit / (re)send the draft. */
const EDITABLE_STATUSES = new Set<MeetingStatus>([
  'DRAFTED',
  'CHANGES_REQUESTED',
]);

@Injectable()
export class MeetingService {
  private readonly logger = new Logger(MeetingService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: RelayDb,
    @Inject(DRAFT_GENERATOR)
    private readonly draftGenerator: DraftGenerator,
    @Inject(GITHUB_ISSUE_PUBLISHER)
    private readonly issuePublisher: GithubIssuePublisher,
    private readonly approvals: ApprovalService,
    private readonly config: ConfigService,
  ) {}

  /** Ingest a transcript, generate a draft, persist it for review. */
  async createFromTranscript(dto: CreateMeetingDto): Promise<MeetingWithTasks> {
    const draft = await this.draftGenerator.generateDraft(dto.transcript);

    const id = await this.db.transaction(async (tx) => {
      const [meeting] = await tx
        .insert(meetings)
        .values({
          title: dto.title,
          transcript: dto.transcript,
          clientEmail: dto.clientEmail,
          githubRepo: dto.githubRepo,
          status: 'DRAFTED',
          summary: draft.summary,
        })
        .returning({ id: meetings.id });

      if (draft.tasks.length > 0) {
        await tx.insert(meetingTasks).values(
          draft.tasks.map((task, index) => ({
            meetingId: meeting!.id,
            title: task.title,
            body: task.body,
            assignee: task.assignee ?? null,
            position: index,
          })),
        );
      }
      return meeting!.id;
    });

    return this.findOne(id);
  }

  /** All meetings, newest activity first, for the desktop list. */
  list(): Promise<MeetingWithTasks[]> {
    return this.db.query.meetings.findMany({
      with: { tasks: { orderBy: [asc(meetingTasks.position)] } },
      orderBy: [desc(meetings.updatedAt)],
    });
  }

  async findOne(id: string): Promise<MeetingWithTasks> {
    const meeting = await this.db.query.meetings.findFirst({
      where: eq(meetings.id, id),
      with: { tasks: { orderBy: [asc(meetingTasks.position)] } },
    });
    if (!meeting) {
      throw new NotFoundException(`Meeting ${id} not found.`);
    }
    return meeting;
  }

  /** Replace the founder-edited summary and task list. */
  async updateDraft(
    id: string,
    dto: UpdateMeetingDraftDto,
  ): Promise<MeetingWithTasks> {
    const meeting = await this.findOne(id);
    this.assertEditable(meeting.status);

    await this.db.transaction(async (tx) => {
      await tx.update(meetings).set({ summary: dto.summary }).where(eq(meetings.id, id));
      await tx.delete(meetingTasks).where(eq(meetingTasks.meetingId, id));
      if (dto.tasks.length > 0) {
        await tx.insert(meetingTasks).values(
          dto.tasks.map((task, index) => ({
            meetingId: id,
            title: task.title,
            body: task.body ?? '',
            assignee: task.assignee ?? null,
            position: index,
          })),
        );
      }
    });

    return this.findOne(id);
  }

  /**
   * Freeze the current draft into an approval snapshot and create a magic link
   * for the client. Returns the meeting plus the link the client should open.
   */
  async sendForApproval(
    id: string,
  ): Promise<{ meeting: MeetingWithTasks; approvalUrl: string }> {
    const meeting = await this.findOne(id);
    this.assertEditable(meeting.status);

    const approval = await this.approvals.createForMeeting(meeting.id, {
      title: meeting.title,
      summary: meeting.summary ?? '',
      tasks: meeting.tasks.map((task) => ({
        title: task.title,
        body: task.body,
        assignee: task.assignee,
      })),
    });

    await this.db
      .update(meetings)
      .set({ status: 'PENDING_APPROVAL' })
      .where(eq(meetings.id, id));

    const baseUrl = this.config.get<string>(
      'PUBLIC_BASE_URL',
      'http://localhost:3000',
    );
    const approvalUrl = `${baseUrl}/approve/${approval.token}`;

    // v0.1: no email yet — surface the link so the founder can send it.
    // A NotificationModule will emit the email on `meeting.sent_for_approval`.
    this.logger.log(
      `Approval link for "${meeting.title}" (client ${meeting.clientEmail}): ${approvalUrl}`,
    );

    return { meeting: await this.findOne(id), approvalUrl };
  }

  /**
   * Apply a client's decision. Invoked from the approval event handler, not
   * from a request. On approval, pushes the tasks to GitHub.
   */
  async applyDecision(
    meetingId: string,
    decision: 'APPROVED' | 'CHANGES_REQUESTED',
    comment: string | null,
  ): Promise<void> {
    const meeting = await this.findOne(meetingId);

    if (decision === 'CHANGES_REQUESTED') {
      await this.db
        .update(meetings)
        .set({ status: 'CHANGES_REQUESTED', clientComment: comment })
        .where(eq(meetings.id, meetingId));
      this.logger.log(
        `Meeting ${meetingId} — client requested changes${comment ? `: "${comment}"` : ''}.`,
      );
      return;
    }

    // KNOWN LIMITATION (v0.1): this runs in an event handler with no retry or
    // compensation. The stub never fails, so it's invisible today — but with a
    // real GitHub adapter, a transient failure here leaves the approval APPROVED
    // while the meeting stays PENDING_APPROVAL, and idempotency blocks a retry.
    // This is exactly the durable-execution seam Temporal is meant to own
    // (CLAUDE.md: "every external integration should have retries"). Move this
    // to a Temporal activity before the real adapter ships.
    const published = await this.issuePublisher.publishIssues(
      meeting.githubRepo,
      meeting.tasks.map((task) => ({
        title: task.title,
        body: task.body,
        assignee: task.assignee,
      })),
    );

    await this.db.transaction(async (tx) => {
      await Promise.all(
        published.map((issue, index) => {
          const task = meeting.tasks[index];
          if (!task) return Promise.resolve();
          return tx
            .update(meetingTasks)
            .set({ githubIssueUrl: issue.url })
            .where(eq(meetingTasks.id, task.id));
        }),
      );
      await tx
        .update(meetings)
        .set({ status: 'APPROVED', clientComment: comment })
        .where(eq(meetings.id, meetingId));
    });

    this.logger.log(
      `Meeting ${meetingId} approved — ${published.length} tasks pushed to ${meeting.githubRepo}.`,
    );
  }

  private assertEditable(status: MeetingStatus): void {
    if (!EDITABLE_STATUSES.has(status)) {
      throw new BadRequestException(
        `Meeting is ${status}; it can no longer be edited or sent.`,
      );
    }
  }
}
