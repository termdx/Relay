import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateDecisionDto } from './dto/decision.dto';
import type { Decision } from './decision.schema';
import { DecisionService } from './decision.service';

/** Thin controller: validate, invoke service, return. No business logic. */
@Controller('projects/:projectId/decisions')
export class DecisionController {
  constructor(private readonly decisions: DecisionService) {}

  @Get()
  list(@Param('projectId') projectId: string): Promise<Decision[]> {
    return this.decisions.listByProject(projectId);
  }

  @Post()
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateDecisionDto,
  ): Promise<Decision> {
    return this.decisions.create(projectId, dto);
  }
}
