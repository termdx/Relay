import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class RespondApprovalDto {
  @IsIn(['APPROVED', 'CHANGES_REQUESTED'])
  decision!: 'APPROVED' | 'CHANGES_REQUESTED';

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  comment?: string;
}
