/**
 * `ConfigurationModule` parses `process.env` at module-evaluation time (the
 * moment `configuration.module.ts` is first required), not lazily at DI
 * resolution, so anything importing a provider module needs the environment
 * in place BEFORE that import runs. Importing this file first is how a spec
 * arranges that — the same trick, and the same reasoning, as
 * `test/e2e/auth/support/set-test-environment.ts`.
 *
 * None of these values reaches a real AWS account or is a real secret.
 */

function setIfAbsent(name: string, value: string): void {
  if (process.env[name] === undefined || process.env[name] === '') {
    process.env[name] = value;
  }
}

setIfAbsent('TABLE_NAME', 'stockroom-throttling-unit');
setIfAbsent('AWS_REGION', 'us-east-1');
setIfAbsent('JWT_ISSUER', 'https://auth.stockroom.test');
setIfAbsent('JWT_AUDIENCE', 'stockroom-api');
setIfAbsent('SIGNING_KEY_PARAMETER_NAME', '/stockroom/test/signing-key');
setIfAbsent(
  'VERIFICATION_KEYS_PARAMETER_NAME',
  '/stockroom/test/verification-keys',
);
