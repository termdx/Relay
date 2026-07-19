import { Module } from '@nestjs/common';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { PortalAuthService } from './portal-auth.service';
import { PortalController } from './portal.controller';
import { PortalGuard } from './portal.guard';
import { PortalService } from './portal.service';

@Module({
  imports: [KnowledgeModule],
  controllers: [PortalController],
  providers: [PortalAuthService, PortalGuard, PortalService],
  exports: [PortalAuthService],
})
export class PortalModule {}
