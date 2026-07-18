import { Module } from '@nestjs/common';
import { BrandingController, BrandingService } from './branding.controller';

@Module({
  controllers: [BrandingController],
  providers: [BrandingService],
})
export class BrandingModule {}
