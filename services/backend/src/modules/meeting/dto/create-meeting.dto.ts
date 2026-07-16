import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
} from 'class-validator';

export class CreateMeetingDto {
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
