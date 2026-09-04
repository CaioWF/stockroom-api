import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';

/** No providers: `HealthController` has nothing to inject (AC-22). */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
