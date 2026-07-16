import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
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
        type: 'better-sqlite3',
        // v0.1: SQLite so the loop runs with zero infra. Swap `type`/config
        // to Postgres (database.md's source of truth) when data outgrows this.
        database: config.get<string>('DATABASE_PATH', 'relay.dev.sqlite'),
        autoLoadEntities: true,
        // Fine for a fresh MVP; introduce migrations before real data lands.
        synchronize: true,
      }),
    }),
    AiModule,
    GithubModule,
    ApprovalModule,
    MeetingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
