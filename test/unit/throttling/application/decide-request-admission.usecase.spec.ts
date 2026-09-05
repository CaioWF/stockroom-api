/**
 * `DecideRequestAdmissionUseCase` composition tests (plan.md's use-case
 * layer; AC-6, AC-9, AC-18, AC-22, FR21, FR22, FR30). Exercises the real
 * domain functions (`throttle-policy.ts`) against a real in-memory fake
 * store (`InMemoryRateLimitStore`) — never a mock of the store or the
 * logger — and asserts on the `StructuredLogger`'s actual emitted output
 * via an injectable `LogSink`, per this project's `test-driven-development`
 * rule against asserting on mocks.
 */

import { ControllableClock } from '../../../fakes/controllable-clock';
import { InMemoryRateLimitStore } from '../../../fakes/in-memory-rate-limit-store';
import { FailingRateLimitStore } from '../../../fakes/failing-rate-limit-store';
import { InstanceLocalLimiter } from '../../../../src/throttling/infrastructure/local/instance-local-limiter';
import { StructuredLogger } from '../../../../src/shared/observability/structured-logger';
import { RateLimitPolicy } from '../../../../src/throttling/domain/rate-limit-policy';
import {
  AdmissionRequest,
  DecideRequestAdmissionUseCase,
} from '../../../../src/throttling/application/decide-request-admission.usecase';
import { RateLimitStore } from '../../../../src/throttling/domain/ports/rate-limit-store';

const EPOCH_START = new Date('2024-01-01T00:00:00.000Z');
const WINDOW_SECONDS = 60;
const STORE_DEADLINE_MS = 50;

function capturingLogger(): {
  logger: StructuredLogger;
  lines: Record<string, unknown>[];
} {
  const lines: Record<string, unknown>[] = [];
  const logger = new StructuredLogger((line) =>
    lines.push(JSON.parse(line) as Record<string, unknown>),
  );
  return { logger, lines };
}

function policyWith(overrides: Partial<RateLimitPolicy> = {}): RateLimitPolicy {
  return {
    limit: 5,
    windowSeconds: WINDOW_SECONDS,
    saturationCeiling: 10,
    ...overrides,
  };
}

function requestWith(
  overrides: Partial<AdmissionRequest> = {},
): AdmissionRequest {
  return {
    scope: 'ip',
    identity: '203.0.113.7',
    routeGroup: 'default',
    policy: policyWith(),
    ...overrides,
  };
}

function buildUseCase(options: {
  store: RateLimitStore;
  logger: StructuredLogger;
  fallback?: InstanceLocalLimiter;
  clock?: ControllableClock;
  storeDeadlineMs?: number;
  throttleLocalFallbackFactor?: number;
}): DecideRequestAdmissionUseCase {
  return new DecideRequestAdmissionUseCase(
    options.store,
    options.clock ?? new ControllableClock(EPOCH_START),
    options.fallback ?? new InstanceLocalLimiter({ maxEntries: 100 }),
    options.logger,
    options.storeDeadlineMs ?? STORE_DEADLINE_MS,
    options.throttleLocalFallbackFactor ?? 1,
  );
}

describe('DecideRequestAdmissionUseCase', () => {
  it('admits a low count and logs nothing', async () => {
    const { logger, lines } = capturingLogger();
    const store = new InMemoryRateLimitStore({
      windowSeconds: WINDOW_SECONDS,
      saturationCeiling: 10,
    });
    const useCase = buildUseCase({ store, logger });

    const decision = await useCase.decide(requestWith());

    expect(decision).toEqual({ kind: 'admitted' });
    expect(lines).toHaveLength(0);
  });

  it('refuses once the estimate exceeds the limit and logs throttle_refused with no identity', async () => {
    const { logger, lines } = capturingLogger();
    const policy = policyWith({ limit: 2, saturationCeiling: 10 });
    const store = new InMemoryRateLimitStore({
      windowSeconds: WINDOW_SECONDS,
      saturationCeiling: 10,
    });
    const useCase = buildUseCase({ store, logger });
    const request = requestWith({ policy });

    await useCase.decide(request);
    await useCase.decide(request);
    const decision = await useCase.decide(request);

    expect(decision.kind).toBe('refused');
    if (decision.kind !== 'refused') {
      throw new Error('expected a refusal');
    }
    expect(decision.retryAfterSeconds).toBeGreaterThan(0);

    const refused = lines.find((line) => line.event === 'throttle_refused');
    expect(refused).toEqual({
      event: 'throttle_refused',
      scope: 'ip',
      routeGroup: 'default',
      retryAfterSeconds: decision.retryAfterSeconds,
    });
    for (const line of lines) {
      expect(JSON.stringify(line)).not.toContain(request.identity);
      expect(line).not.toHaveProperty('identity');
    }
  });

  it('refuses on a saturated store outcome with a positive, non-NaN retryAfterSeconds', async () => {
    const { logger, lines } = capturingLogger();
    const ceiling = 3;
    // saturationCeiling must stay >= limit (it is limit * a factor >= 1 in
    // the real policy resolver) — a low limit here is what makes
    // `saturationCeiling + 1` a guaranteed refusal once saturation hits.
    const policy = policyWith({ limit: 2, saturationCeiling: ceiling });
    const store = new InMemoryRateLimitStore({
      windowSeconds: WINDOW_SECONDS,
      saturationCeiling: ceiling,
    });
    const useCase = buildUseCase({ store, logger });
    const request = requestWith({ policy });

    await useCase.decide(request);
    await useCase.decide(request);
    await useCase.decide(request);
    const decision = await useCase.decide(request);

    expect(decision.kind).toBe('refused');
    if (decision.kind !== 'refused') {
      throw new Error('expected a refusal');
    }
    expect(Number.isNaN(decision.retryAfterSeconds)).toBe(false);
    expect(decision.retryAfterSeconds).toBeGreaterThan(0);
    expect(decision.retryAfterSeconds).toBeLessThanOrEqual(3 * WINDOW_SECONDS);

    const refused = lines.find((line) => line.event === 'throttle_refused');
    expect(refused).toBeDefined();
  });

  it('admits via the fallback when the store is immediately degraded, logging throttle_degraded but not throttle_refused', async () => {
    const { logger, lines } = capturingLogger();
    const store = FailingRateLimitStore.immediatelyDegraded();
    const useCase = buildUseCase({ store, logger });

    const decision = await useCase.decide(requestWith());

    expect(decision).toEqual({ kind: 'admitted' });
    expect(lines.some((line) => line.event === 'throttle_degraded')).toBe(true);
    expect(lines.some((line) => line.event === 'throttle_refused')).toBe(false);

    const degraded = lines.find((line) => line.event === 'throttle_degraded');
    expect(degraded).toMatchObject({
      event: 'throttle_degraded',
      scope: 'ip',
      routeGroup: 'default',
    });
    expect(typeof degraded?.context).toBe('string');
  });

  it('refuses via the fallback when the route-limit-derived local ceiling is exhausted, degraded logged before refused', async () => {
    const { logger, lines } = capturingLogger();
    const store = FailingRateLimitStore.immediatelyDegraded();
    const fallback = new InstanceLocalLimiter({ maxEntries: 100 });
    const policy = policyWith({ limit: 1, saturationCeiling: 10 });
    const useCase = buildUseCase({ store, logger, fallback });
    const request = requestWith({ policy });

    await useCase.decide(request);
    const decision = await useCase.decide(request);

    expect(decision).toEqual({
      kind: 'refused',
      retryAfterSeconds: WINDOW_SECONDS,
    });
    const eventOrder = lines.map((line) => line.event);
    const firstDegradedIndex = eventOrder.lastIndexOf('throttle_degraded');
    const lastRefusedIndex = eventOrder.lastIndexOf('throttle_refused');
    expect(firstDegradedIndex).toBeGreaterThanOrEqual(0);
    expect(lastRefusedIndex).toBeGreaterThan(firstDegradedIndex);
  });

  it('multiplies the route limit by the configured fallback factor in degraded mode', async () => {
    const { logger } = capturingLogger();
    const store = FailingRateLimitStore.immediatelyDegraded();
    const fallback = new InstanceLocalLimiter({ maxEntries: 100 });
    const policy = policyWith({ limit: 2, saturationCeiling: 10 });
    const useCase = buildUseCase({
      store,
      logger,
      fallback,
      throttleLocalFallbackFactor: 2,
    });
    const request = requestWith({ policy });

    await expect(useCase.decide(request)).resolves.toEqual({
      kind: 'admitted',
    });
    await expect(useCase.decide(request)).resolves.toEqual({
      kind: 'admitted',
    });
    await expect(useCase.decide(request)).resolves.toEqual({
      kind: 'admitted',
    });
    await expect(useCase.decide(request)).resolves.toEqual({
      kind: 'admitted',
    });
    await expect(useCase.decide(request)).resolves.toEqual({
      kind: 'refused',
      retryAfterSeconds: WINDOW_SECONDS,
    });
  });

  it('bounds total wait to the configured deadline even when the store call would take far longer, admitting via the fallback with no unhandled rejection', async () => {
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown): void => {
      unhandledRejections.push(reason);
    };
    process.on('unhandledRejection', onUnhandledRejection);

    try {
      const { logger, lines } = capturingLogger();
      const farLongerThanDeadline = STORE_DEADLINE_MS * 20;
      const store = FailingRateLimitStore.delayedBy(
        farLongerThanDeadline,
        'reject',
      );
      const useCase = buildUseCase({ store, logger });

      const startedAt = Date.now();
      const decision = await useCase.decide(requestWith());
      const elapsedMs = Date.now() - startedAt;

      // Total budget, not per-call: the fake would take 20x the deadline to
      // settle on its own, so resolving near the deadline (generous
      // tolerance for CI jitter, still far under the fake's own delay)
      // proves the abort actually bounded the wait rather than merely
      // giving up on it.
      expect(elapsedMs).toBeLessThan(STORE_DEADLINE_MS + 200);
      expect(decision).toEqual({ kind: 'admitted' });
      expect(lines.some((line) => line.event === 'throttle_degraded')).toBe(
        true,
      );

      // Give any dangling timer/promise a chance to misbehave before we
      // assert nothing did.
      await new Promise((resolve) =>
        setTimeout(resolve, farLongerThanDeadline),
      );
      expect(unhandledRejections).toHaveLength(0);
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
    }
  }, 10_000);

  it('admits when the fallback limiter itself throws, never propagating and never refusing (FR22)', async () => {
    const { logger, lines } = capturingLogger();
    const store = FailingRateLimitStore.immediatelyDegraded();
    const throwingFallback = {
      recordAndCheck: (): boolean => {
        throw new TypeError('boom from fallback');
      },
    } as unknown as InstanceLocalLimiter;
    const useCase = buildUseCase({ store, logger, fallback: throwingFallback });

    const decision = await useCase.decide(requestWith());

    expect(decision).toEqual({ kind: 'admitted' });
    expect(lines.some((line) => line.event === 'throttle_refused')).toBe(false);
  });

  it('admits when the logger itself throws on every call, never propagating (FR22)', async () => {
    const throwingLogger = new StructuredLogger(() => {
      throw new Error('sink is broken');
    });
    const store = FailingRateLimitStore.immediatelyDegraded();
    const useCase = buildUseCase({ store, logger: throwingLogger });

    const decision = await useCase.decide(requestWith());

    expect(decision).toEqual({ kind: 'admitted' });
  });
});
