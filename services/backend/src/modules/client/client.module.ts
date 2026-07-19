import { Module } from '@nestjs/common';
import { PortalModule } from '../portal/portal.module';
import { ClientController } from './client.controller';
import { ClientService } from './client.service';

@Module({
  imports: [PortalModule],
  controllers: [ClientController],
  providers: [ClientService],
  exports: [ClientService],
})
export class ClientModule {}
