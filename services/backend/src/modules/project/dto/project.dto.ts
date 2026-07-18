import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
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

/** Boolean-only, known-keys-only — sanitized again in the service. */
export class PortalSettingsDto {
  @IsOptional() @IsBoolean() showAnalytics?: boolean;
  @IsOptional() @IsBoolean() showFeed?: boolean;
  @IsOptional() @IsBoolean() feedShowsCode?: boolean;
  @IsOptional() @IsBoolean() showTodos?: boolean;
  @IsOptional() @IsBoolean() showDecisions?: boolean;
  @IsOptional() @IsBoolean() showAsk?: boolean;
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PortalSettingsDto)
  portalSettings?: PortalSettingsDto;

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
