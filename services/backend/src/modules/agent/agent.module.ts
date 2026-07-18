import { Module } from '@nestjs/common';
import { DecisionModule } from '../decision/decision.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { TimelineModule } from '../timeline/timeline.module';
import { TodoModule } from '../todo/todo.module';
import { AgentExecutorService } from './agent-executor.service';
import { AgentRunController, AgentRunService } from './agent-run.controller';
import { AgentToolsService } from './agent-tools.service';

@Module({
  imports: [KnowledgeModule, TodoModule, DecisionModule, TimelineModule],
  controllers: [AgentRunController],
  providers: [AgentToolsService, AgentExecutorService, AgentRunService],
})
export class AgentModule {}
