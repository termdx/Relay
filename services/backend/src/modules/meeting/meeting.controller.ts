import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDraftDto } from './dto/update-meeting-draft.dto';
import type { MeetingWithTasks } from './meeting.schema';
import { MeetingService } from './meeting.service';

/** Thin controller: validate, invoke service, return. No business logic. */
@Controller('meetings')
export class MeetingController {
  constructor(private readonly meetings: MeetingService) {}

  @Get()
  list(): Promise<MeetingWithTasks[]> {
    return this.meetings.list();
  }

  @Post()
  create(@Body() dto: CreateMeetingDto): Promise<MeetingWithTasks> {
    return this.meetings.createFromTranscript(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<MeetingWithTasks> {
    return this.meetings.findOne(id);
  }

  @Get(':id/approval-link')
  getApprovalLink(
    @Param('id') id: string,
  ): Promise<{ approvalUrl: string | null }> {
    return this.meetings.getApprovalLink(id);
  }

  @Patch(':id/draft')
  updateDraft(
    @Param('id') id: string,
    @Body() dto: UpdateMeetingDraftDto,
  ): Promise<MeetingWithTasks> {
    return this.meetings.updateDraft(id, dto);
  }

  @Post(':id/send-for-approval')
  sendForApproval(
    @Param('id') id: string,
  ): Promise<{ meeting: MeetingWithTasks; approvalUrl: string }> {
    return this.meetings.sendForApproval(id);
  }
}
