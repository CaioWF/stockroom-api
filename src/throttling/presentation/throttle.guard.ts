import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { IS_PUBLIC_KEY } from '../../auth/presentation/public.decorator';
import type { AppConfig } from '../../shared/config/environment.schema';
import { StructuredLogger } from '../../shared/observability/structured-logger';
import { DecideRequestAdmissionUseCase } from '../application/decide-request-admission.usecase';
import { ThrottleRouteGroup } from '../domain/throttle-scope';
import { deriveClientAddressIdentity } from './client-address.policy';
import { IS_THROTTLE_EXEMPT_KEY } from './no-throttle.decorator';
import { RateLimitExceededError } from './rate-limit-exceeded.error';
import { THROTTLE_GROUP_KEY } from './throttle-group.decorator';
import { resolveThrottlePolicy } from './throttle-policy-resolver';

const DEFAULT_ROUTE_GROUP: ThrottleRouteGroup = 'default';

export class ThrottleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly decideRequestAdmission: DecideRequestAdmissionUseCase,
    private readonly config: AppConfig,
    private readonly logger: StructuredLogger,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.isExempt(context) || !this.isPublic(context)) {
      return true;
    }
    try {
      await this.admitPublicRequest(context);
    } catch (error: unknown) {
      if (error instanceof RateLimitExceededError) {
        throw error;
      }
      this.logEntrypointError(error);
    }
    return true;
  }

  private async admitPublicRequest(context: ExecutionContext): Promise<void> {
    const routeGroup = this.routeGroup(context);
    const decision = await this.decideRequestAdmission.decide({
      scope: 'ip',
      identity: deriveClientAddressIdentity(this.requestOf(context)),
      routeGroup,
      policy: resolveThrottlePolicy(this.config, 'ip', routeGroup),
    });
    if (decision.kind === 'refused') {
      throw new RateLimitExceededError(decision.retryAfterSeconds);
    }
  }

  private requestOf(context: ExecutionContext): Request {
    return context.switchToHttp().getRequest<Request>();
  }

  private isPublic(context: ExecutionContext): boolean {
    return this.metadata<boolean>(context, IS_PUBLIC_KEY) ?? false;
  }

  private isExempt(context: ExecutionContext): boolean {
    return this.metadata<boolean>(context, IS_THROTTLE_EXEMPT_KEY) ?? false;
  }

  private routeGroup(context: ExecutionContext): ThrottleRouteGroup {
    return (
      this.metadata<ThrottleRouteGroup>(context, THROTTLE_GROUP_KEY) ??
      DEFAULT_ROUTE_GROUP
    );
  }

  private metadata<T>(context: ExecutionContext, key: string): T | undefined {
    return this.reflector.getAllAndOverride<T>(key, [
      context.getHandler(),
      context.getClass(),
    ]);
  }

  private logEntrypointError(error: unknown): void {
    this.logger.log({
      event: 'throttle_entrypoint_error',
      outcome: 'admitted',
      context: error instanceof Error ? error.message : 'unknown error',
    });
  }
}
