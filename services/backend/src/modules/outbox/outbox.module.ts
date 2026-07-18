import { Global, Module } from '@nestjs/common';
import { OutboxService } from './outbox.service';

/** Global: any module may enqueue side effects or register handlers. */
@Global()
@Module({
  providers: [OutboxService],
  exports: [OutboxService],
})
export class OutboxModule {}
