import { Controller, Get, Param } from '@nestjs/common';
import type { TimelineEvent } from './timeline.schema';
import { TimelineService } from './timeline.service';

/** Thin controller: validate, invoke service, return. No business logic. */
@Controller('projects/:projectId/timeline')
export class TimelineController {
  constructor(private readonly timeline: TimelineService) {}

  @Get()
  list(@Param('projectId') projectId: string): Promise<TimelineEvent[]> {
    return this.timeline.listByProject(projectId);
  }
}
