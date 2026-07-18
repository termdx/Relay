import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateDecisionDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  detail?: string;
}
