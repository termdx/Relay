import { Global, Module } from '@nestjs/common';
import { DomainEventBus } from './domain-event-bus';

/** Global so any module can inject the bus without importing this module. */
@Global()
@Module({
  providers: [DomainEventBus],
  exports: [DomainEventBus],
})
export class EventsModule {}
