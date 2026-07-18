import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Injectable,
  Put,
} from '@nestjs/common';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { DRIZZLE, type RelayDb } from '../../database/drizzle.provider';
import { Public } from '../auth/public.decorator';
import { branding } from './branding.schema';

export interface BrandingView {
  agencyName: string | null;
  logo: string | null;
  accentColor: string | null;
}

export class UpdateBrandingDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  agencyName?: string;

  /** data:image/… (small) or https URL; empty string clears. */
  @IsOptional()
  @IsString()
  @MaxLength(200_000)
  logo?: string;

  @IsOptional()
  @Matches(/^(#[0-9a-fA-F]{6})?$/, {
    message: 'accentColor must be a #rrggbb hex (or empty to clear)',
  })
  accentColor?: string;
}

@Injectable()
export class BrandingService {
  constructor(@Inject(DRIZZLE) private readonly db: RelayDb) {}

  async get(): Promise<BrandingView> {
    const [row] = await this.db.select().from(branding).limit(1);
    return {
      agencyName: row?.agencyName ?? null,
      logo: row?.logo ?? null,
      accentColor: row?.accentColor ?? null,
    };
  }

  async update(dto: UpdateBrandingDto): Promise<BrandingView> {
    if (dto.logo && !/^(https:\/\/|data:image\/(png|jpeg|webp|svg\+xml);base64,)/.test(dto.logo)) {
      throw new BadRequestException(
        'logo must be an https URL or a base64 image data URI',
      );
    }
    const changes = {
      ...(dto.agencyName !== undefined && { agencyName: dto.agencyName || null }),
      ...(dto.logo !== undefined && { logo: dto.logo || null }),
      ...(dto.accentColor !== undefined && { accentColor: dto.accentColor || null }),
    };
    const [existing] = await this.db.select().from(branding).limit(1);
    if (existing) {
      await this.db.update(branding).set(changes);
    } else {
      await this.db.insert(branding).values(changes);
    }
    return this.get();
  }
}

/** Owner-managed branding; the portal reads it publicly (login page needs it). */
@Controller()
export class BrandingController {
  constructor(private readonly service: BrandingService) {}

  @Get('branding')
  get(): Promise<BrandingView> {
    return this.service.get();
  }

  @Put('branding')
  update(@Body() dto: UpdateBrandingDto): Promise<BrandingView> {
    return this.service.update(dto);
  }

  /** Public: name, logo, accent — nothing sensitive. */
  @Public()
  @Get('portal/branding')
  publicBranding(): Promise<BrandingView> {
    return this.service.get();
  }
}
