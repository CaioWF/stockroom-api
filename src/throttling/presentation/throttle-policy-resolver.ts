import type { AppConfig } from '../../shared/config/environment.schema';
import { RateLimitPolicy } from '../domain/rate-limit-policy';
import { ThrottleRouteGroup, ThrottleScope } from '../domain/throttle-scope';

export function resolveThrottlePolicy(
  config: AppConfig,
  scope: ThrottleScope,
  routeGroup: ThrottleRouteGroup,
): RateLimitPolicy {
  const limit =
    scope === 'account'
      ? config.throttleAuthenticatedLimit
      : publicLimit(config, routeGroup);
  const windowSeconds =
    scope === 'account'
      ? config.throttleAuthenticatedWindowSeconds
      : publicWindowSeconds(config, routeGroup);
  return {
    limit,
    windowSeconds,
    saturationCeiling: limit * config.throttleCounterSaturationFactor,
  };
}

function publicLimit(
  config: AppConfig,
  routeGroup: ThrottleRouteGroup,
): number {
  if (routeGroup === 'credentials') {
    return config.throttleCredentialsLimit;
  }
  if (routeGroup === 'refresh') {
    return config.throttleRefreshLimit;
  }
  return routeGroup === 'jwks'
    ? config.throttleJwksLimit
    : config.throttleAuthenticatedLimit;
}

function publicWindowSeconds(
  config: AppConfig,
  routeGroup: ThrottleRouteGroup,
): number {
  if (routeGroup === 'credentials') {
    return config.throttleCredentialsWindowSeconds;
  }
  if (routeGroup === 'refresh') {
    return config.throttleRefreshWindowSeconds;
  }
  return routeGroup === 'jwks'
    ? config.throttleJwksWindowSeconds
    : config.throttleAuthenticatedWindowSeconds;
}
