import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { AuthModule } from './auth/auth.module';
import { authProblemMappings } from './auth/presentation/auth-problem-mappings';
import { HealthModule } from './health/health.module';
import { ProblemDetailsFilter } from './shared/presentation/problem-details.filter';
import { PROBLEM_MAPPINGS } from './shared/presentation/problem-mapping';
import { ThrottlingModule } from './throttling/throttling.module';
import { throttlingProblemMappings } from './throttling/presentation/throttling-problem-mappings';

// Composition root. Feature modules (auth, health, shared/*) register here
// as later tasks add them — see plan.md's File Structure.
@Module({
  imports: [AuthModule, HealthModule, ThrottlingModule],
  providers: [
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    {
      provide: PROBLEM_MAPPINGS,
      useValue: [authProblemMappings, throttlingProblemMappings],
    },
  ],
})
export class AppModule {}
