import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';

import { IS_PUBLIC_KEY } from '../../../../src/auth/presentation/public.decorator';
import type { AuthenticatedRequest } from '../../../../src/auth/presentation/jwt-auth.guard';
import type { AppConfig } from '../../../../src/shared/config/environment.schema';
import { StructuredLogger } from '../../../../src/shared/observability/structured-logger';
import { DecideRequestAdmissionUseCase } from '../../../../src/throttling/application/decide-request-admission.usecase';
import { AccountThrottleInterceptor } from '../../../../src/throttling/presentation/account-throttle.interceptor';
import { ThrottleGuard } from '../../../../src/throttling/presentation/throttle.guard';

class ThrowingAdmissionUseCase {
  decide(): Promise<never> {
    return Promise.reject(new TypeError('plain failure'));
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

describe('throttle fail-open boundary', () => {
  it('admits and logs when the public-route guard sees an unclassified error', async () => {
    const lines: string[] = [];
    const guard = new ThrottleGuard(
      new Reflector(),
      new ThrowingAdmissionUseCase() as unknown as DecideRequestAdmissionUseCase,
      CONFIG,
      new StructuredLogger((line) => lines.push(line)),
    );

    await expect(
      guard.canActivate(publicContext({ headers: {} })),
    ).resolves.toBe(true);

    expect(
      lines.map((line) => JSON.parse(line) as { event: string }),
    ).toContainEqual(
      expect.objectContaining({ event: 'throttle_entrypoint_error' }),
    );
  });

  it('admits and logs a protected route that reaches the interceptor without auth claims', async () => {
    const lines: string[] = [];
    const interceptor = new AccountThrottleInterceptor(
      new Reflector(),
      new ThrowingAdmissionUseCase() as unknown as DecideRequestAdmissionUseCase,
      CONFIG,
      new StructuredLogger((line) => lines.push(line)),
    );
    const next: CallHandler = { handle: () => of('handler-result') };

    await expect(
      lastValueFrom(interceptor.intercept(protectedContext({}), next)),
    ).resolves.toBe('handler-result');

    expect(
      lines.map((line) => JSON.parse(line) as { event: string }),
    ).toContainEqual(
      expect.objectContaining({ event: 'throttle_missing_auth_claims' }),
    );
  });
});
