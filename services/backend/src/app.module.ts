import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
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
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        // The system of record (database.md). The runtime generates this URL
        // from the compose it stands up; fail fast if it is missing.
        url: config.getOrThrow<string>('DATABASE_URL'),
        autoLoadEntities: true,
        // Fine for a fresh MVP; introduce migrations before real data lands
        // (required once vector columns exist — see DatabaseBootstrapService).
        synchronize: true,
      }),
    }),
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
