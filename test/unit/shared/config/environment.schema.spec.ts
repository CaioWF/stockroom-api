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
});
