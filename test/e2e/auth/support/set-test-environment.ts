/**
 * Sets the environment variables `ConfigurationModule`'s `parseAppConfig`
 * needs to boot the app for an e2e run, matching the local compose service
 * (docker-compose.yml) — nothing here reaches a real AWS account or is a
 * real secret, same reasoning `test/integration/*.int-spec.ts` already
 * documents for their own dummy DynamoDB credentials.
 *
 * MUST be the first import of any e2e spec/support file that transitively
 * reaches `src/app.module.ts`: `ConfigurationModule`'s `useValue:
 * parseAppConfig(process.env)` runs at module-evaluation time (the moment
 * `configuration.module.ts` is first required), not lazily at DI resolution
 * time — so the environment has to already be in place before that import
 * chain runs. `setIfAbsent` lets a CI environment override any of these
 * without editing this file.
 */

function setIfAbsent(name: string, value: string): void {
  if (process.env[name] === undefined || process.env[name] === '') {
    process.env[name] = value;
  }
}

export const TEST_ENV = {
  jwtIssuer: 'https://auth.stockroom.test',
  jwtAudience: 'stockroom-api',
} as const;

setIfAbsent('TABLE_NAME', 'stockroom-auth-e2e');
setIfAbsent('AWS_REGION', 'us-east-1');
setIfAbsent('DYNAMODB_ENDPOINT', 'http://localhost:8000');
setIfAbsent('AWS_ACCESS_KEY_ID', 'local');
setIfAbsent('AWS_SECRET_ACCESS_KEY', 'local');
setIfAbsent('JWT_ISSUER', TEST_ENV.jwtIssuer);
setIfAbsent('JWT_AUDIENCE', TEST_ENV.jwtAudience);
setIfAbsent('ACCESS_TOKEN_TTL_SECONDS', '900');
setIfAbsent('REFRESH_TOKEN_TTL_SECONDS', '604800');
setIfAbsent('SESSION_CEILING_SECONDS', '2592000');
setIfAbsent('SIGNING_KEY_PARAMETER_NAME', '/stockroom/e2e/signing-key');
setIfAbsent(
  'VERIFICATION_KEYS_PARAMETER_NAME',
  '/stockroom/e2e/verification-keys',
);
setIfAbsent('THROTTLE_CREDENTIALS_LIMIT', '1000');
setIfAbsent('THROTTLE_CREDENTIALS_WINDOW_SECONDS', '60');
setIfAbsent('THROTTLE_REFRESH_LIMIT', '1000');
setIfAbsent('THROTTLE_REFRESH_WINDOW_SECONDS', '60');
setIfAbsent('THROTTLE_JWKS_LIMIT', '1000');
setIfAbsent('THROTTLE_JWKS_WINDOW_SECONDS', '60');
setIfAbsent('THROTTLE_AUTHENTICATED_LIMIT', '1000');
setIfAbsent('THROTTLE_AUTHENTICATED_WINDOW_SECONDS', '60');
setIfAbsent('THROTTLE_COUNTER_SATURATION_FACTOR', '2');
setIfAbsent('THROTTLE_LOCAL_FALLBACK_FACTOR', '1');
setIfAbsent('THROTTLE_LOCAL_CACHE_MAX_ENTRIES', '10000');
setIfAbsent('THROTTLE_STORE_DEADLINE_MILLISECONDS', '500');
setIfAbsent('THROTTLE_STORE_MAX_ATTEMPTS', '3');
