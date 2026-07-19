import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';
import { ProjectService, type ProjectWithClient } from './project.service';

/** Thin controller: validate, invoke service, return. No business logic. */
@Controller('projects')
export class ProjectController {
  constructor(
    private readonly projects: ProjectService,
    private readonly config: ConfigService,
  ) {}

  /** The per-project transcript ingest URL (owner-only; contains the secret). */
  @Get(':id/ingest-url')
  async ingestUrl(@Param('id') id: string): Promise<{ url: string | null }> {
    await this.projects.findOne(id); // 404 for unknown projects
    const secret = this.config.get<string>('INGEST_SECRET');
    if (!secret) return { url: null };
    const base = this.config.get<string>(
      'PUBLIC_BASE_URL',
      'http://localhost:3000',
    );
    return { url: `${base}/webhooks/transcript/${id}?token=${secret}` };
  }

  @Get()
  list(): Promise<ProjectWithClient[]> {
    return this.projects.list();
  }

  @Post()
  create(@Body() dto: CreateProjectDto): Promise<ProjectWithClient> {
    return this.projects.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<ProjectWithClient> {
    return this.projects.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
  ): Promise<ProjectWithClient> {
    return this.projects.update(id, dto);
  }
}
