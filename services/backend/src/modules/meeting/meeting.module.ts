import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../ai/ai.module';
import { ApprovalModule } from '../approval/approval.module';
import { GithubModule } from '../integration/github/github.module';
import { MeetingApprovalHandler } from './meeting-approval.handler';
import { MeetingController } from './meeting.controller';
import { MeetingService } from './meeting.service';
import { Meeting } from './entities/meeting.entity';
import { MeetingTask } from './entities/meeting-task.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Meeting, MeetingTask]),
    AiModule,
    GithubModule,
    ApprovalModule,
  ],
  controllers: [MeetingController],
  providers: [MeetingService, MeetingApprovalHandler],
})
export class MeetingModule {}
