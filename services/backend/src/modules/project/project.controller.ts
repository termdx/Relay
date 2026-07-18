import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';
import { ProjectService, type ProjectWithClient } from './project.service';

/** Thin controller: validate, invoke service, return. No business logic. */
@Controller('projects')
export class ProjectController {
  constructor(private readonly projects: ProjectService) {}

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
