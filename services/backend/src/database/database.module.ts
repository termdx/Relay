import { Module } from '@nestjs/common';
import { DatabaseBootstrapService } from './database-bootstrap.service';

/** Infrastructure module: database extensions and bootstrap concerns. */
@Module({
  providers: [DatabaseBootstrapService],
})
export class DatabaseModule {}
