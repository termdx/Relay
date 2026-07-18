import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';
import type { ProjectStatus } from '../project.schema';

/** "owner/repo" (GitHub) or "gitlab:group/project" / "bitbucket:ws/repo". */
const GITHUB_REPO_PATTERN =
  /^(?:(?:github|gitlab|bitbucket):)?[\w.-]+(?:\/[\w.-]+)+$/;

export class CreateProjectDto {
  @IsUUID()
  clientId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** "owner/repo" */
  @IsOptional()
  @Matches(GITHUB_REPO_PATTERN, {
    message: 'githubRepo must be in "owner/repo" form',
  })
  githubRepo?: string;
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'PAUSED', 'COMPLETED'])
  status?: ProjectStatus;

  @IsOptional()
  @Matches(GITHUB_REPO_PATTERN, {
    message: 'githubRepo must be in "owner/repo" form',
  })
  githubRepo?: string;
}
