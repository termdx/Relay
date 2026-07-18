import { Body, Controller, Param, Post } from '@nestjs/common';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { KnowledgeService, type AskResult } from './knowledge.service';

export class AskDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  question!: string;
}

/** Thin controller: validate, invoke service, return. No business logic. */
@Controller()
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Post('projects/:projectId/ask')
  ask(
    @Param('projectId') projectId: string,
    @Body() dto: AskDto,
  ): Promise<AskResult> {
    return this.knowledge.ask(projectId, dto.question);
  }

  @Post('knowledge/reindex')
  reindex(): Promise<{ scanned: number; added: number }> {
    return this.knowledge.reindex();
  }
}
