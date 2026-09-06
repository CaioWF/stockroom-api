/**
 * Liveness route (FR25, AC-22): a static `200` from pure code, no injected
 * port and no injected client of any kind — that absence is what makes the
 * "touches neither storage nor the signing key" guarantee hold by
 * construction rather than by discipline (plan.md's "Signing keys"
 * decision: a Parameter Store outage must never fail the health check a
 * load balancer polls, or it takes the whole target group down with it).
 */

import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';

import { Public } from '../auth/presentation/public.decorator';
import { NoThrottle } from '../throttling/presentation/no-throttle.decorator';

interface LivenessBody {
  readonly status: 'ok';
}

@Controller('health')
export class HealthController {
  @Public()
  @NoThrottle()
  @Get()
  @HttpCode(HttpStatus.OK)
  check(): LivenessBody {
    return { status: 'ok' };
  }
}
