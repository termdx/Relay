import {
  Body,
  Controller,
  Get,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { desc, eq } from 'drizzle-orm';
import { DRIZZLE, type RelayDb } from '../../database/drizzle.provider';
import { OutboxService } from '../outbox/outbox.service';
import { AGENT_RUN, WORKFLOW_RUN } from './agent-executor.service';
import {
  agentRuns,
  workflowRuns,
  type AgentRun,
  type WorkflowRun,
} from './agent-run.schema';

/** Manifest identity travels with the request — the runtime owns manifests;
 * the backend just executes. */
class AgentSpecDto {
  @IsString() @IsNotEmpty() agentId!: string;
  @IsString() @IsNotEmpty() agentName!: string;
  @IsString() @IsNotEmpty() model!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tools?: string[];
}

class CreateAgentRunDto extends AgentSpecDto {
  @IsUUID() projectId!: string;
  @IsString() @IsNotEmpty() @MaxLength(4000) instruction!: string;
}

class WorkflowStepDto {
  @ValidateNested() @Type(() => AgentSpecDto) agent!: AgentSpecDto;
  @IsString() @IsNotEmpty() @MaxLength(4000) instruction!: string;
}

class CreateWorkflowRunDto {
  @IsString() @IsNotEmpty() workflowId!: string;
  @IsUUID() projectId!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => WorkflowStepDto)
  steps!: WorkflowStepDto[];
}

@Injectable()
class AgentRunService {
  constructor(
    @Inject(DRIZZLE) private readonly db: RelayDb,
    private readonly outbox: OutboxService,
  ) {}

  /** Row + outbox message in one transaction: a queued run is always owed. */
  async createAgentRun(dto: CreateAgentRunDto): Promise<AgentRun> {
    return this.db.transaction(async (tx) => {
      const [run] = await tx
        .insert(agentRuns)
        .values({
          agentId: dto.agentId,
          agentName: dto.agentName,
          model: dto.model,
          tools: dto.tools ?? [],
          projectId: dto.projectId,
          instruction: dto.instruction,
        })
        .returning();
      await this.outbox.enqueue(tx, AGENT_RUN, { runId: run!.id });
      return run!;
    });
  }

  async createWorkflowRun(dto: CreateWorkflowRunDto): Promise<WorkflowRun> {
    return this.db.transaction(async (tx) => {
      const [run] = await tx
        .insert(workflowRuns)
        .values({
          workflowId: dto.workflowId,
          projectId: dto.projectId,
          steps: dto.steps.map((step) => ({
            agent: {
              agentId: step.agent.agentId,
              agentName: step.agent.agentName,
              model: step.agent.model,
              tools: step.agent.tools ?? [],
            },
            instruction: step.instruction,
          })),
        })
        .returning();
      await this.outbox.enqueue(tx, WORKFLOW_RUN, { runId: run!.id });
      return run!;
    });
  }
}

/** Thin controller: validate, invoke service, return. No business logic. */
@Controller()
export class AgentRunController {
  constructor(
    @Inject(DRIZZLE) private readonly db: RelayDb,
    private readonly runs: AgentRunService,
  ) {}

  @Post('agent-runs')
  create(@Body() dto: CreateAgentRunDto): Promise<AgentRun> {
    return this.runs.createAgentRun(dto);
  }

  @Get('agent-runs/:id')
  async get(@Param('id') id: string): Promise<AgentRun> {
    const run = await this.db.query.agentRuns.findFirst({
      where: eq(agentRuns.id, id),
    });
    if (!run) throw new NotFoundException(`Run ${id} not found.`);
    return run;
  }

  @Get('agent-runs')
  list(@Query('projectId') projectId?: string): Promise<AgentRun[]> {
    return this.db.query.agentRuns.findMany({
      ...(projectId ? { where: eq(agentRuns.projectId, projectId) } : {}),
      orderBy: [desc(agentRuns.createdAt)],
      limit: 25,
    });
  }

  @Post('workflow-runs')
  createWorkflow(@Body() dto: CreateWorkflowRunDto): Promise<WorkflowRun> {
    return this.runs.createWorkflowRun(dto);
  }

  @Get('workflow-runs/:id')
  async getWorkflow(@Param('id') id: string): Promise<WorkflowRun> {
    const run = await this.db.query.workflowRuns.findFirst({
      where: eq(workflowRuns.id, id),
    });
    if (!run) throw new NotFoundException(`Run ${id} not found.`);
    return run;
  }
}

export { AgentRunService };
