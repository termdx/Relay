import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AiModule } from './modules/ai/ai.module';
import { ApprovalModule } from './modules/approval/approval.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard';
import { GithubModule } from './modules/integration/github/github.module';
import { MeetingModule } from './modules/meeting/meeting.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    // Postgres is the system of record (database.md). DatabaseModule owns the
    // connection, the Drizzle handle, extensions and migrations.
    DatabaseModule,
    AuthModule,
    AiModule,
    GithubModule,
    ApprovalModule,
    MeetingModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Authenticated by default: routes must opt out with @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
