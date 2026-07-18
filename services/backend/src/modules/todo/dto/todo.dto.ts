import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { TodoStatus } from '../todo.schema';

export class CreateTodoDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  assignee?: string;
}

export class UpdateTodoStatusDto {
  @IsIn(['OPEN', 'DONE'])
  status!: TodoStatus;
}
