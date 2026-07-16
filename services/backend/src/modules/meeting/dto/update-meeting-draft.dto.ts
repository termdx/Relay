import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class DraftTaskDto {
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

/** The founder's edited draft. Replaces the summary and the full task list. */
export class UpdateMeetingDraftDto {
  @IsString()
  summary!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DraftTaskDto)
  tasks!: DraftTaskDto[];
}
