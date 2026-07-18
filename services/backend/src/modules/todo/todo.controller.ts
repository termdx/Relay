import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CreateTodoDto, UpdateTodoStatusDto } from './dto/todo.dto';
import type { Todo } from './todo.schema';
import { TodoService } from './todo.service';

/** Thin controller: validate, invoke service, return. No business logic. */
@Controller()
export class TodoController {
  constructor(private readonly todos: TodoService) {}

  @Get('projects/:projectId/todos')
  list(@Param('projectId') projectId: string): Promise<Todo[]> {
    return this.todos.listByProject(projectId);
  }

  @Post('projects/:projectId/todos')
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateTodoDto,
  ): Promise<Todo> {
    return this.todos.create(projectId, dto);
  }

  @Patch('todos/:id/status')
  setStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTodoStatusDto,
  ): Promise<Todo> {
    return this.todos.setStatus(id, dto);
  }
}
