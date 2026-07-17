import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { ApprovalModule } from '../approval/approval.module';
import { GithubModule } from '../integration/github/github.module';
import { MeetingApprovalHandler } from './meeting-approval.handler';
import { MeetingController } from './meeting.controller';
import { MeetingService } from './meeting.service';

@Module({
  imports: [AiModule, GithubModule, ApprovalModule],
  controllers: [MeetingController],
  providers: [MeetingService, MeetingApprovalHandler],
})
export class MeetingModule {}
