import { Module } from '@nestjs/common';
import { StructuredLogger } from './structured-logger';

/**
 * Wires the allow-list logger for injection elsewhere. A factory provider
 * keeps `StructuredLogger` itself framework-free — nothing but this file
 * depends on `@nestjs/common`.
 */
@Module({
  providers: [
    {
      provide: StructuredLogger,
      useFactory: (): StructuredLogger => new StructuredLogger(),
    },
  ],
  exports: [StructuredLogger],
})
export class ObservabilityModule {}
