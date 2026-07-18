import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

export class CreateMeetingDto {
  /** Attribute the meeting to a project — fills the timeline. */
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  transcript!: string;

  @IsEmail()
  clientEmail!: string;

  /** "owner/repo" */
  @Matches(/^[\w.-]+\/[\w.-]+$/, {
    message: 'githubRepo must be in "owner/repo" form',
  })
  githubRepo!: string;
}
