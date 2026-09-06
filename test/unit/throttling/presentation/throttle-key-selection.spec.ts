import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';

import { IS_PUBLIC_KEY } from '../../../../src/auth/presentation/public.decorator';
import type { AuthenticatedRequest } from '../../../../src/auth/presentation/jwt-auth.guard';
import type { AppConfig } from '../../../../src/shared/config/environment.schema';
import { StructuredLogger } from '../../../../src/shared/observability/structured-logger';
import type { AdmissionRequest } from '../../../../src/throttling/application/decide-request-admission.usecase';
import { DecideRequestAdmissionUseCase } from '../../../../src/throttling/application/decide-request-admission.usecase';
import { AccountThrottleInterceptor } from '../../../../src/throttling/presentation/account-throttle.interceptor';
import { ThrottleGuard } from '../../../../src/throttling/presentation/throttle.guard';
import { THROTTLE_GROUP_KEY } from '../../../../src/throttling/presentation/throttle-group.decorator';

class CapturingAdmissionUseCase {
  requests: AdmissionRequest[] = [];

  decide(request: AdmissionRequest): Promise<{ readonly kind: 'admitted' }> {
    this.requests.push(request);
    return Promise.resolve({ kind: 'admitted' });
  }
}

const CONFIG = {
  throttleCredentialsLimit: 10,
  throttleCredentialsWindowSeconds: 60,
  throttleRefreshLimit: 60,
  throttleRefreshWindowSeconds: 60,
  throttleJwksLimit: 120,
  throttleJwksWindowSeconds: 60,
  throttleAuthenticatedLimit: 100,
  throttleAuthenticatedWindowSeconds: 60,
  throttleCounterSaturationFactor: 2,
} as AppConfig;

function publicContext(
  request: Partial<AuthenticatedRequest>,
): ExecutionContext {
  const handler = (): void => undefined;
  Reflect.defineMetadata(IS_PUBLIC_KEY, true, handler);
  Reflect.defineMetadata(THROTTLE_GROUP_KEY, 'credentials', handler);
  return buildContext(handler, request);
}

function protectedContext(
  request: Partial<AuthenticatedRequest>,
): ExecutionContext {
  return buildContext((): void => undefined, request);
}

function buildContext(
  handler: () => void,
  request: Partial<AuthenticatedRequest>,
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => class TestController {},
  } as unknown as ExecutionContext;
}

describe('throttle key selection', () => {
  it('keys public routes by client address and route group', async () => {
    const useCase = new CapturingAdmissionUseCase();
    const guard = new ThrottleGuard(
      new Reflector(),
      useCase as DecideRequestAdmissionUseCase,
      CONFIG,
      new StructuredLogger(() => undefined),
    );

    await guard.canActivate(
      publicContext({
        headers: { 'x-forwarded-for': '198.51.100.10, 203.0.113.8' },
      }),
    );

    expect(useCase.requests).toEqual([
      expect.objectContaining({
        scope: 'ip',
        identity: '203.0.113.8',
        routeGroup: 'credentials',
        policy: { limit: 10, windowSeconds: 60, saturationCeiling: 20 },
      }),
    ]);
  });

  it('keys protected routes by verified account id before invoking the handler', async () => {
    const useCase = new CapturingAdmissionUseCase();
    const interceptor = new AccountThrottleInterceptor(
      new Reflector(),
      useCase as DecideRequestAdmissionUseCase,
      CONFIG,
      new StructuredLogger(() => undefined),
    );
    const next: CallHandler = { handle: () => of('handler-result') };

    await interceptor
      .intercept(
        protectedContext({
          authClaims: {
            accountId: '00000000-0000-7000-8000-000000000001',
            email: 'user@example.com',
          },
        }),
        next,
      )
      .toPromise();

    expect(useCase.requests).toEqual([
      expect.objectContaining({
        scope: 'account',
        identity: '00000000-0000-7000-8000-000000000001',
        routeGroup: 'default',
        policy: { limit: 100, windowSeconds: 60, saturationCeiling: 200 },
      }),
    ]);
  });
});
