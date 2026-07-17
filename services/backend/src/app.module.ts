import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AiModule } from './modules/ai/ai.module';
import { ApprovalModule } from './modules/approval/approval.module';
import { GithubModule } from './modules/integration/github/github.module';
import { MeetingModule } from './modules/meeting/meeting.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    // Postgres is the system of record (database.md). DatabaseModule owns the
    // connection, the Drizzle handle, extensions and migrations.
    DatabaseModule,
    AiModule,
    GithubModule,
    ApprovalModule,
    MeetingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
