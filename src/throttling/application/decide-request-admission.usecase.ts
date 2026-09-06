/**
 * Composes the throttling domain into one admission decision per request
 * (plan.md's use-case layer). Three outcomes, in order of preference:
 *
 * 1. The store answers authoritatively (`counted` or `saturated`) within
 *    the deadline: the domain policy (`throttle-policy.ts`) decides.
 * 2. The store cannot answer (`RateLimitStoreDegradedError`, including the
 *    deadline itself firing): fail OPEN to a coarse, per-instance fallback
 *    limiter rather than blocking every caller on one dependency (FR22).
 * 3. Anything else — a defect anywhere in this use case's own code, the
 *    fallback throwing, the logger throwing — fails open to plain admission
 *    (FR22's outer boundary): a bug in the throttling path must never turn
 *    a request that was going to succeed into a refusal.
 */

import { Clock } from '../../auth/domain/ports/clock';
import { StructuredLogger } from '../../shared/observability/structured-logger';
import {
  deriveFallbackCeiling,
  InstanceLocalLimiter,
} from '../infrastructure/local/instance-local-limiter';
import { RateLimitPolicy } from '../domain/rate-limit-policy';
import { RateLimitStoreDegradedError } from '../domain/rate-limit-store-degraded.error';
import { RateLimitWindow } from '../domain/rate-limit-window';
import { ThrottleDecision } from '../domain/throttle-decision';
import {
  decideAdmission,
  estimateRequestCount,
  RetryAfterInputs,
} from '../domain/throttle-policy';
import { ThrottleRouteGroup, ThrottleScope } from '../domain/throttle-scope';
import {
  RateLimitStore,
  ThrottleCounterOutcome,
} from '../domain/ports/rate-limit-store';

export interface AdmissionRequest {
  readonly scope: ThrottleScope;
  readonly identity: string;
  readonly routeGroup: ThrottleRouteGroup;
  readonly policy: RateLimitPolicy;
}

/**
 * Any estimate guaranteed to exceed `saturationCeiling` produces a refusal.
 * Used only for the store's own `saturated` outcome, where there is no real
 * count to weight — `throttle-policy.ts`'s module doc explains why the
 * `Retry-After` computation does not depend on the specific value once a
 * refusal is established, only on the window shape.
 */
const GUARANTEED_REFUSAL_MARGIN = 1;

export class DecideRequestAdmissionUseCase {
  constructor(
    private readonly store: RateLimitStore,
    private readonly clock: Clock,
    private readonly fallback: InstanceLocalLimiter,
    private readonly logger: StructuredLogger,
    private readonly storeDeadlineMs: number,
    private readonly throttleLocalFallbackFactor: number,
  ) {}

  async decide(request: AdmissionRequest): Promise<ThrottleDecision> {
    try {
      return await this.decideOrFallBackToDegraded(request);
    } catch (error: unknown) {
      // FR22's outer boundary: anything unclassified — a bug in this class,
      // the fallback throwing, the logger throwing — admits rather than
      // propagating. The `RateLimitStoreDegradedError` path below has
      // already done its own richer handling before this ever runs.
      this.logUnclassifiedErrorBestEffort(error);
      return { kind: 'admitted' };
    }
  }

  private async decideOrFallBackToDegraded(
    request: AdmissionRequest,
  ): Promise<ThrottleDecision> {
    const window = RateLimitWindow.fromClock(
      this.clock,
      request.policy.windowSeconds,
    );
    try {
      const outcome = await this.countWithDeadline(request, window);
      return this.decideFromOutcome(request, window, outcome);
    } catch (error: unknown) {
      if (!(error instanceof RateLimitStoreDegradedError)) {
        throw error;
      }
      return this.decideFromDegraded(request, window, error);
    }
  }

  private async countWithDeadline(
    request: AdmissionRequest,
    window: RateLimitWindow,
  ): Promise<ThrottleCounterOutcome> {
    const controller = new AbortController();
    // Aborting here is what makes the underlying store adapter's in-flight
    // SDK call actually cancel (FR21) rather than settle later, unobserved,
    // as an unhandled rejection.
    const timeout = setTimeout(() => controller.abort(), this.storeDeadlineMs);
    try {
      return await this.store.countRequest(
        {
          scope: request.scope,
          identity: request.identity,
          routeGroup: request.routeGroup,
        },
        window.getStartEpochSeconds(),
        controller.signal,
      );
    } finally {
      // Always cleared: an uncleared timer keeps the event loop alive and,
      // on a warm Lambda, can extend billed duration or leak across
      // invocations.
      clearTimeout(timeout);
    }
  }

  private decideFromOutcome(
    request: AdmissionRequest,
    window: RateLimitWindow,
    outcome: ThrottleCounterOutcome,
  ): ThrottleDecision {
    const retryAfterInputs = this.retryAfterInputsFor(request, window);
    const estimate =
      outcome.kind === 'saturated'
        ? request.policy.saturationCeiling + GUARANTEED_REFUSAL_MARGIN
        : estimateRequestCount(
            outcome.counter.previousCount,
            outcome.counter.currentCount,
            window.getElapsedFraction(),
            request.policy.saturationCeiling,
          );

    const decision = decideAdmission(
      estimate,
      request.policy.limit,
      retryAfterInputs,
    );
    return this.emitIfRefused(request, decision);
  }

  private decideFromDegraded(
    request: AdmissionRequest,
    window: RateLimitWindow,
    error: RateLimitStoreDegradedError,
  ): ThrottleDecision {
    // Emitted before consulting the fallback so a fallback bug can never
    // suppress the alarm signal that the primary store is unhealthy.
    this.logger.log({
      event: 'throttle_degraded',
      scope: request.scope,
      routeGroup: request.routeGroup,
      context: error.message,
    });

    const admittedLocally = this.fallback.recordAndCheck(
      this.fallbackIdentityKey(request),
      window.getStartEpochSeconds(),
      request.policy.windowSeconds,
      deriveFallbackCeiling(
        request.policy.limit,
        this.throttleLocalFallbackFactor,
      ),
    );
    if (admittedLocally) {
      return { kind: 'admitted' };
    }

    // The fallback is a coarse ceiling, not a weighted window — there are
    // no real counts to invert into a precise Retry-After, so the window's
    // own length stands in as a simple, honest, conservative estimate.
    return this.emitIfRefused(request, {
      kind: 'refused',
      retryAfterSeconds: request.policy.windowSeconds,
    });
  }

  private emitIfRefused(
    request: AdmissionRequest,
    decision: ThrottleDecision,
  ): ThrottleDecision {
    if (decision.kind === 'refused') {
      this.logger.log({
        event: 'throttle_refused',
        scope: request.scope,
        routeGroup: request.routeGroup,
        retryAfterSeconds: decision.retryAfterSeconds,
      });
    }
    return decision;
  }

  private retryAfterInputsFor(
    request: AdmissionRequest,
    window: RateLimitWindow,
  ): RetryAfterInputs {
    return {
      elapsedFraction: window.getElapsedFraction(),
      windowSeconds: request.policy.windowSeconds,
      saturationCeiling: request.policy.saturationCeiling,
    };
  }

  // A single string key for the fallback's in-process Map — unlike the
  // store, which takes structured fields. Never persisted, so the exact
  // format only has to be internally consistent within one instance.
  private fallbackIdentityKey(request: AdmissionRequest): string {
    return `${request.scope}:${request.identity}:${request.routeGroup}`;
  }

  private logUnclassifiedErrorBestEffort(error: unknown): void {
    try {
      this.logger.log({
        event: 'throttle_admission_error',
        outcome: 'admitted',
        context: error instanceof Error ? error.message : 'unknown error',
      });
    } catch {
      // Best-effort: a broken logger must never turn fail-open into a throw.
    }
  }
}
