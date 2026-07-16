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
import { Meeting } from './entities/meeting.entity';
import { MeetingService } from './meeting.service';

/** Thin controller: validate, invoke service, return. No business logic. */
@Controller('meetings')
export class MeetingController {
  constructor(private readonly meetings: MeetingService) {}

  @Post()
  create(@Body() dto: CreateMeetingDto): Promise<Meeting> {
    return this.meetings.createFromTranscript(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Meeting> {
    return this.meetings.findOne(id);
  }

  @Patch(':id/draft')
  updateDraft(
    @Param('id') id: string,
    @Body() dto: UpdateMeetingDraftDto,
  ): Promise<Meeting> {
    return this.meetings.updateDraft(id, dto);
  }

  @Post(':id/send-for-approval')
  sendForApproval(
    @Param('id') id: string,
  ): Promise<{ meeting: Meeting; approvalUrl: string }> {
    return this.meetings.sendForApproval(id);
  }
}
