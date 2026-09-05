import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, mergeMap, Observable } from 'rxjs';

import { IS_PUBLIC_KEY } from '../../auth/presentation/public.decorator';
import type { AuthenticatedRequest } from '../../auth/presentation/jwt-auth.guard';
import type { AppConfig } from '../../shared/config/environment.schema';
import { StructuredLogger } from '../../shared/observability/structured-logger';
import { DecideRequestAdmissionUseCase } from '../application/decide-request-admission.usecase';
import { ThrottleRouteGroup } from '../domain/throttle-scope';
import { IS_THROTTLE_EXEMPT_KEY } from './no-throttle.decorator';
import { RateLimitExceededError } from './rate-limit-exceeded.error';
import { THROTTLE_GROUP_KEY } from './throttle-group.decorator';
import { resolveThrottlePolicy } from './throttle-policy-resolver';

const DEFAULT_ROUTE_GROUP: ThrottleRouteGroup = 'default';

export class AccountThrottleInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly decideRequestAdmission: DecideRequestAdmissionUseCase,
    private readonly config: AppConfig,
    private readonly logger: StructuredLogger,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (this.isExempt(context) || this.isPublic(context)) {
      return next.handle();
    }
    return from(this.admitAccountRequest(context)).pipe(
      mergeMap(() => next.handle()),
    );
  }

  private async admitAccountRequest(context: ExecutionContext): Promise<void> {
    const request = this.requestOf(context);
    if (request.authClaims === undefined) {
      this.logMissingClaims();
      return;
    }
    await this.throwIfRefused(context, request.authClaims.accountId);
  }

  private async throwIfRefused(
    context: ExecutionContext,
    accountId: string,
  ): Promise<void> {
    try {
      const routeGroup = this.routeGroup(context);
      const decision = await this.decideRequestAdmission.decide({
        scope: 'account',
        identity: accountId,
        routeGroup,
        policy: resolveThrottlePolicy(this.config, 'account', routeGroup),
      });
      if (decision.kind === 'refused') {
        throw new RateLimitExceededError(decision.retryAfterSeconds);
      }
    } catch (error: unknown) {
      this.handleAdmissionError(error);
    }
  }

  private handleAdmissionError(error: unknown): void {
    if (error instanceof RateLimitExceededError) {
      throw error;
    }
    this.logger.log({
      event: 'throttle_entrypoint_error',
      outcome: 'admitted',
      context: error instanceof Error ? error.message : 'unknown error',
    });
  }

  private requestOf(context: ExecutionContext): AuthenticatedRequest {
    return context.switchToHttp().getRequest<AuthenticatedRequest>();
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

  private logMissingClaims(): void {
    this.logger.log({
      event: 'throttle_missing_auth_claims',
      outcome: 'admitted',
      context: 'protected route reached account throttling without auth claims',
    });
  }
}
