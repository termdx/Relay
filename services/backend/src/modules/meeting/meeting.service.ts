import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApprovalService } from '../approval/approval.service';
import { DRAFT_GENERATOR, type DraftGenerator } from '../ai/draft-generator';
import {
  GITHUB_ISSUE_PUBLISHER,
  type GithubIssuePublisher,
} from '../integration/github/github-issue-publisher';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDraftDto } from './dto/update-meeting-draft.dto';
import { Meeting } from './entities/meeting.entity';
import { MeetingTask } from './entities/meeting-task.entity';

/** Statuses from which the founder may still edit / (re)send the draft. */
const EDITABLE_STATUSES = new Set(['DRAFTED', 'CHANGES_REQUESTED']);

@Injectable()
export class MeetingService {
  private readonly logger = new Logger(MeetingService.name);

  constructor(
    @InjectRepository(Meeting)
    private readonly meetings: Repository<Meeting>,
    @InjectRepository(MeetingTask)
    private readonly tasks: Repository<MeetingTask>,
    @Inject(DRAFT_GENERATOR)
    private readonly draftGenerator: DraftGenerator,
    @Inject(GITHUB_ISSUE_PUBLISHER)
    private readonly issuePublisher: GithubIssuePublisher,
    private readonly approvals: ApprovalService,
    private readonly config: ConfigService,
  ) {}

  /** Ingest a transcript, generate a draft, persist it for review. */
  async createFromTranscript(dto: CreateMeetingDto): Promise<Meeting> {
    const draft = await this.draftGenerator.generateDraft(dto.transcript);

    const meeting = this.meetings.create({
      title: dto.title,
      transcript: dto.transcript,
      clientEmail: dto.clientEmail,
      githubRepo: dto.githubRepo,
      status: 'DRAFTED',
      summary: draft.summary,
      tasks: draft.tasks.map((task, index) =>
        this.tasks.create({
          title: task.title,
          body: task.body,
          assignee: task.assignee ?? null,
          githubIssueUrl: null,
          position: index,
        }),
      ),
    });

    return this.meetings.save(meeting);
  }

  async findOne(id: string): Promise<Meeting> {
    const meeting = await this.meetings.findOne({ where: { id } });
    if (!meeting) {
      throw new NotFoundException(`Meeting ${id} not found.`);
    }
    return meeting;
  }

  /** Replace the founder-edited summary and task list. */
  async updateDraft(
    id: string,
    dto: UpdateMeetingDraftDto,
  ): Promise<Meeting> {
    const meeting = await this.findOne(id);
    this.assertEditable(meeting);

    await this.tasks.delete({ meeting: { id } });

    meeting.summary = dto.summary;
    meeting.tasks = dto.tasks.map((task, index) =>
      this.tasks.create({
        title: task.title,
        body: task.body ?? '',
        assignee: task.assignee ?? null,
        githubIssueUrl: null,
        position: index,
      }),
    );

    return this.meetings.save(meeting);
  }

  /**
   * Freeze the current draft into an approval snapshot and create a magic link
   * for the client. Returns the meeting plus the link the client should open.
   */
  async sendForApproval(
    id: string,
  ): Promise<{ meeting: Meeting; approvalUrl: string }> {
    const meeting = await this.findOne(id);
    this.assertEditable(meeting);

    const approval = await this.approvals.createForMeeting(meeting.id, {
      title: meeting.title,
      summary: meeting.summary ?? '',
      tasks: meeting.tasks
        .sort((a, b) => a.position - b.position)
        .map((task) => ({
          title: task.title,
          body: task.body,
          assignee: task.assignee,
        })),
    });

    meeting.status = 'PENDING_APPROVAL';
    await this.meetings.save(meeting);

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

    return { meeting, approvalUrl };
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
      meeting.status = 'CHANGES_REQUESTED';
      await this.meetings.save(meeting);
      this.logger.log(
        `Meeting ${meetingId} — client requested changes${comment ? `: "${comment}"` : ''}.`,
      );
      return;
    }

    const published = await this.issuePublisher.publishIssues(
      meeting.githubRepo,
      meeting.tasks.map((task) => ({
        title: task.title,
        body: task.body,
        assignee: task.assignee,
      })),
    );

    const ordered = [...meeting.tasks].sort(
      (a, b) => a.position - b.position,
    );
    published.forEach((issue, index) => {
      const task = ordered[index];
      if (task) {
        task.githubIssueUrl = issue.url;
      }
    });

    meeting.status = 'APPROVED';
    await this.meetings.save(meeting);
    this.logger.log(
      `Meeting ${meetingId} approved — ${published.length} tasks pushed to ${meeting.githubRepo}.`,
    );
  }

  private assertEditable(meeting: Meeting): void {
    if (!EDITABLE_STATUSES.has(meeting.status)) {
      throw new BadRequestException(
        `Meeting is ${meeting.status}; it can no longer be edited or sent.`,
      );
    }
  }
}
