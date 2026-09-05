import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { Module, Provider } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR, Reflector } from '@nestjs/core';

import { Clock } from '../auth/domain/ports/clock';
import { SystemClock } from '../auth/infrastructure/crypto/system-clock';
import {
  APP_CONFIG,
  ConfigurationModule,
} from '../shared/config/configuration.module';
import type { AppConfig } from '../shared/config/environment.schema';
import { ObservabilityModule } from '../shared/observability/observability.module';
import { StructuredLogger } from '../shared/observability/structured-logger';
import { DecideRequestAdmissionUseCase } from './application/decide-request-admission.usecase';
import {
  RateLimitStore,
  ThrottleCounterIdentity,
  ThrottleCounterOutcome,
} from './domain/ports/rate-limit-store';
import { RateLimitStoreDegradedError } from './domain/rate-limit-store-degraded.error';
import { ThrottleRouteGroup, ThrottleScope } from './domain/throttle-scope';
import { DynamoThrottleCounterRepository } from './infrastructure/dynamo/throttle-counter.repository';
import {
  THROTTLE_DYNAMO_DOCUMENT_CLIENT,
  throttleDynamoClientProvider,
} from './infrastructure/dynamo/throttle-dynamo-client.provider';
import { InstanceLocalLimiter } from './infrastructure/local/instance-local-limiter';
import { AccountThrottleInterceptor } from './presentation/account-throttle.interceptor';
import { ThrottleGuard } from './presentation/throttle.guard';
import { resolveThrottlePolicy } from './presentation/throttle-policy-resolver';

const THROTTLE_RATE_LIMIT_STORE = Symbol('THROTTLE_RATE_LIMIT_STORE');
const THROTTLE_CLOCK = Symbol('THROTTLE_CLOCK');
const THROTTLE_FALLBACK_LIMITER = Symbol('THROTTLE_FALLBACK_LIMITER');

class ConfiguredThrottleStore implements RateLimitStore {
  constructor(
    private readonly documentClient: DynamoDBDocumentClient,
    private readonly config: AppConfig,
  ) {}

  countRequest(
    key: ThrottleCounterIdentity,
    currentWindowStart: number,
    signal?: AbortSignal,
  ): Promise<ThrottleCounterOutcome> {
    const policy = resolveThrottlePolicy(
      this.config,
      this.scopeOf(key),
      this.routeGroupOf(key),
    );
    return this.repositoryFor(policy).countRequest(
      key,
      currentWindowStart,
      signal,
    );
  }

  private repositoryFor(policy: {
    readonly windowSeconds: number;
    readonly saturationCeiling: number;
  }): DynamoThrottleCounterRepository {
    return new DynamoThrottleCounterRepository(
      this.documentClient,
      this.config.tableName,
      {
        windowSeconds: policy.windowSeconds,
        saturationCeiling: policy.saturationCeiling,
        maxAttempts: this.config.throttleStoreMaxAttempts,
      },
    );
  }

  private scopeOf(key: ThrottleCounterIdentity): ThrottleScope {
    if (key.scope === 'ip' || key.scope === 'account') {
      return key.scope;
    }
    throw new RateLimitStoreDegradedError('InvalidThrottleScope');
  }

  private routeGroupOf(key: ThrottleCounterIdentity): ThrottleRouteGroup {
    if (isThrottleRouteGroup(key.routeGroup)) {
      return key.routeGroup;
    }
    throw new RateLimitStoreDegradedError('InvalidThrottleRouteGroup');
  }
}

function isThrottleRouteGroup(value: string): value is ThrottleRouteGroup {
  return (
    value === 'credentials' ||
    value === 'refresh' ||
    value === 'jwks' ||
    value === 'default'
  );
}

const clockProvider: Provider = {
  provide: THROTTLE_CLOCK,
  useFactory: (): Clock => new SystemClock(),
};

const fallbackLimiterProvider: Provider = {
  provide: THROTTLE_FALLBACK_LIMITER,
  useFactory: (config: AppConfig): InstanceLocalLimiter =>
    new InstanceLocalLimiter({
      maxEntries: config.throttleLocalCacheMaxEntries,
    }),
  inject: [APP_CONFIG],
};

const storeProvider: Provider = {
  provide: THROTTLE_RATE_LIMIT_STORE,
  useFactory: (
    documentClient: DynamoDBDocumentClient,
    config: AppConfig,
  ): RateLimitStore => new ConfiguredThrottleStore(documentClient, config),
  inject: [THROTTLE_DYNAMO_DOCUMENT_CLIENT, APP_CONFIG],
};

const admissionUseCaseProvider: Provider = {
  provide: DecideRequestAdmissionUseCase,
  useFactory: (
    store: RateLimitStore,
    clock: Clock,
    fallback: InstanceLocalLimiter,
    logger: StructuredLogger,
    config: AppConfig,
  ): DecideRequestAdmissionUseCase =>
    new DecideRequestAdmissionUseCase(
      store,
      clock,
      fallback,
      logger,
      config.throttleStoreDeadlineMilliseconds,
      config.throttleLocalFallbackFactor,
    ),
  inject: [
    THROTTLE_RATE_LIMIT_STORE,
    THROTTLE_CLOCK,
    THROTTLE_FALLBACK_LIMITER,
    StructuredLogger,
    APP_CONFIG,
  ],
};

const throttleGuardProvider: Provider = {
  provide: APP_GUARD,
  useFactory: (
    reflector: Reflector,
    useCase: DecideRequestAdmissionUseCase,
    config: AppConfig,
    logger: StructuredLogger,
  ): ThrottleGuard => new ThrottleGuard(reflector, useCase, config, logger),
  inject: [
    Reflector,
    DecideRequestAdmissionUseCase,
    APP_CONFIG,
    StructuredLogger,
  ],
};

const accountThrottleInterceptorProvider: Provider = {
  provide: APP_INTERCEPTOR,
  useFactory: (
    reflector: Reflector,
    useCase: DecideRequestAdmissionUseCase,
    config: AppConfig,
    logger: StructuredLogger,
  ): AccountThrottleInterceptor =>
    new AccountThrottleInterceptor(reflector, useCase, config, logger),
  inject: [
    Reflector,
    DecideRequestAdmissionUseCase,
    APP_CONFIG,
    StructuredLogger,
  ],
};

@Module({
  imports: [ConfigurationModule, ObservabilityModule],
  providers: [
    throttleDynamoClientProvider,
    clockProvider,
    fallbackLimiterProvider,
    storeProvider,
    admissionUseCaseProvider,
    throttleGuardProvider,
    accountThrottleInterceptorProvider,
  ],
})
export class ThrottlingModule {}
