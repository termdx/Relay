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

  /** "owner/repo" (GitHub) or "gitlab:group/project" / "bitbucket:ws/repo". */
  @Matches(/^(?:(?:github|gitlab|bitbucket):)?[\w.-]+(?:\/[\w.-]+)+$/, {
    message:
      'githubRepo must be "owner/repo", optionally prefixed "gitlab:" or "bitbucket:"',
  })
  githubRepo!: string;
}
