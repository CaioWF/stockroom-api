import { parseAppConfig } from '../../../../src/shared/config/environment.schema';

// Obviously-fake values — no real secret, endpoint, or issuer.
function validEnv(): Record<string, string | undefined> {
  return {
    TABLE_NAME: 'stockroom-table',
    AWS_REGION: 'us-east-1',
    DYNAMODB_ENDPOINT: 'http://localhost:8000',
    JWT_ISSUER: 'https://auth.example.test',
    JWT_AUDIENCE: 'stockroom-clients',
    ACCESS_TOKEN_TTL_SECONDS: '600',
    REFRESH_TOKEN_TTL_SECONDS: '86400',
    SESSION_CEILING_SECONDS: '172800',
    SIGNING_KEY_PARAMETER_NAME: '/stockroom/signing-key',
    VERIFICATION_KEYS_PARAMETER_NAME: '/stockroom/verification-keys',
  };
}

describe('parseAppConfig', () => {
  it('parses a complete, valid environment into camelCase fields with numeric lifetimes', () => {
    const config = parseAppConfig(validEnv());

    expect(config).toEqual({
      tableName: 'stockroom-table',
      awsRegion: 'us-east-1',
      dynamodbEndpoint: 'http://localhost:8000',
      jwtIssuer: 'https://auth.example.test',
      jwtAudience: 'stockroom-clients',
      accessTokenTtlSeconds: 600,
      refreshTokenTtlSeconds: 86400,
      sessionCeilingSeconds: 172800,
      signingKeyParameterName: '/stockroom/signing-key',
      verificationKeysParameterName: '/stockroom/verification-keys',
      throttleCredentialsLimit: 10,
      throttleCredentialsWindowSeconds: 60,
      throttleRefreshLimit: 60,
      throttleRefreshWindowSeconds: 60,
      throttleJwksLimit: 120,
      throttleJwksWindowSeconds: 60,
      throttleAuthenticatedLimit: 100,
      throttleAuthenticatedWindowSeconds: 60,
      throttleCounterSaturationFactor: 2,
      throttleLocalFallbackFactor: 1,
      throttleLocalCacheMaxEntries: 10000,
      throttleStoreDeadlineMilliseconds: 500,
      throttleStoreMaxAttempts: 3,
    });
  });

  it('omits DYNAMODB_ENDPOINT and leaves dynamodbEndpoint undefined, per the deployed case', () => {
    const env = validEnv();
    delete env.DYNAMODB_ENDPOINT;

    const config = parseAppConfig(env);

    expect(config.dynamodbEndpoint).toBeUndefined();
  });

  it('applies FR7 defaults (900s / 604800s / 2592000s) when the three lifetimes are omitted', () => {
    const env = validEnv();
    delete env.ACCESS_TOKEN_TTL_SECONDS;
    delete env.REFRESH_TOKEN_TTL_SECONDS;
    delete env.SESSION_CEILING_SECONDS;

    const config = parseAppConfig(env);

    expect(config.accessTokenTtlSeconds).toBe(900);
    expect(config.refreshTokenTtlSeconds).toBe(604800);
    expect(config.sessionCeilingSeconds).toBe(2592000);
  });

  const requiredVariables = [
    'TABLE_NAME',
    'AWS_REGION',
    'JWT_ISSUER',
    'JWT_AUDIENCE',
    'SIGNING_KEY_PARAMETER_NAME',
    'VERIFICATION_KEYS_PARAMETER_NAME',
  ] as const;

  it.each(requiredVariables)(
    'rejects a missing %s and names it in the error',
    (variableName) => {
      const env = validEnv();
      delete env[variableName];

      expect(() => parseAppConfig(env)).toThrow(variableName);
    },
  );

  it.each(requiredVariables)(
    'rejects a blank %s and names it in the error',
    (variableName) => {
      const env = validEnv();
      env[variableName] = '   ';

      expect(() => parseAppConfig(env)).toThrow(variableName);
    },
  );

  it('rejects a non-URL JWT_ISSUER and names it in the error', () => {
    const env = validEnv();
    env.JWT_ISSUER = 'not-a-url';

    expect(() => parseAppConfig(env)).toThrow('JWT_ISSUER');
  });

  it('rejects a non-URL DYNAMODB_ENDPOINT and names it in the error', () => {
    const env = validEnv();
    env.DYNAMODB_ENDPOINT = 'not-a-url';

    expect(() => parseAppConfig(env)).toThrow('DYNAMODB_ENDPOINT');
  });

  const lifetimeVariables = [
    'ACCESS_TOKEN_TTL_SECONDS',
    'REFRESH_TOKEN_TTL_SECONDS',
    'SESSION_CEILING_SECONDS',
  ] as const;

  it.each(lifetimeVariables)(
    'rejects a non-numeric %s and names it in the error',
    (variableName) => {
      const env = validEnv();
      env[variableName] = 'not-a-number';

      expect(() => parseAppConfig(env)).toThrow(variableName);
    },
  );

  it.each(lifetimeVariables)(
    'rejects a zero %s and names it in the error',
    (variableName) => {
      const env = validEnv();
      env[variableName] = '0';

      expect(() => parseAppConfig(env)).toThrow(variableName);
    },
  );

  it.each(lifetimeVariables)(
    'rejects a negative %s and names it in the error',
    (variableName) => {
      const env = validEnv();
      env[variableName] = '-5';

      expect(() => parseAppConfig(env)).toThrow(variableName);
    },
  );

  it('applies throttle config defaults when all throttle variables are omitted', () => {
    const env = validEnv();
    const config = parseAppConfig(env);

    expect(config.throttleCredentialsLimit).toBe(10);
    expect(config.throttleCredentialsWindowSeconds).toBe(60);
    expect(config.throttleRefreshLimit).toBe(60);
    expect(config.throttleRefreshWindowSeconds).toBe(60);
    expect(config.throttleJwksLimit).toBe(120);
    expect(config.throttleJwksWindowSeconds).toBe(60);
    expect(config.throttleAuthenticatedLimit).toBe(100);
    expect(config.throttleAuthenticatedWindowSeconds).toBe(60);
    expect(config.throttleCounterSaturationFactor).toBe(2);
    expect(config.throttleLocalFallbackFactor).toBe(1);
    expect(config.throttleLocalCacheMaxEntries).toBe(10000);
    expect(config.throttleStoreDeadlineMilliseconds).toBe(500);
    expect(config.throttleStoreMaxAttempts).toBe(3);
  });

  it('overrides throttle config defaults when variables are explicitly set', () => {
    const env = validEnv();
    env.THROTTLE_CREDENTIALS_LIMIT = '20';
    env.THROTTLE_CREDENTIALS_WINDOW_SECONDS = '120';
    env.THROTTLE_REFRESH_LIMIT = '80';
    env.THROTTLE_REFRESH_WINDOW_SECONDS = '120';
    env.THROTTLE_JWKS_LIMIT = '200';
    env.THROTTLE_JWKS_WINDOW_SECONDS = '120';
    env.THROTTLE_AUTHENTICATED_LIMIT = '150';
    env.THROTTLE_AUTHENTICATED_WINDOW_SECONDS = '120';
    env.THROTTLE_COUNTER_SATURATION_FACTOR = '3';
    env.THROTTLE_LOCAL_FALLBACK_FACTOR = '2';
    env.THROTTLE_LOCAL_CACHE_MAX_ENTRIES = '20000';
    env.THROTTLE_STORE_DEADLINE_MILLISECONDS = '1000';
    env.THROTTLE_STORE_MAX_ATTEMPTS = '5';

    const config = parseAppConfig(env);

    expect(config.throttleCredentialsLimit).toBe(20);
    expect(config.throttleCredentialsWindowSeconds).toBe(120);
    expect(config.throttleRefreshLimit).toBe(80);
    expect(config.throttleRefreshWindowSeconds).toBe(120);
    expect(config.throttleJwksLimit).toBe(200);
    expect(config.throttleJwksWindowSeconds).toBe(120);
    expect(config.throttleAuthenticatedLimit).toBe(150);
    expect(config.throttleAuthenticatedWindowSeconds).toBe(120);
    expect(config.throttleCounterSaturationFactor).toBe(3);
    expect(config.throttleLocalFallbackFactor).toBe(2);
    expect(config.throttleLocalCacheMaxEntries).toBe(20000);
    expect(config.throttleStoreDeadlineMilliseconds).toBe(1000);
    expect(config.throttleStoreMaxAttempts).toBe(5);
  });
});
