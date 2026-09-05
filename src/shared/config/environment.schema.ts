import { z } from 'zod';

/**
 * FR7: access tokens live 15 minutes, refresh tokens 7 days, and a session's
 * absolute ceiling is 30 days. These are the only variables with defaults —
 * every other field is required, because guessing a security-relevant value
 * (an issuer, a table name, a key path) is worse than refusing to start.
 */
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 900;
const DEFAULT_REFRESH_TOKEN_TTL_SECONDS = 604800;
const DEFAULT_SESSION_CEILING_SECONDS = 2592000;

// Throttle configuration defaults for rate-limiting per route group
const DEFAULT_THROTTLE_CREDENTIALS_LIMIT = 10;
const DEFAULT_THROTTLE_CREDENTIALS_WINDOW_SECONDS = 60;
const DEFAULT_THROTTLE_REFRESH_LIMIT = 60;
const DEFAULT_THROTTLE_REFRESH_WINDOW_SECONDS = 60;
const DEFAULT_THROTTLE_JWKS_LIMIT = 120;
const DEFAULT_THROTTLE_JWKS_WINDOW_SECONDS = 60;
const DEFAULT_THROTTLE_AUTHENTICATED_LIMIT = 100;
const DEFAULT_THROTTLE_AUTHENTICATED_WINDOW_SECONDS = 60;
const DEFAULT_THROTTLE_COUNTER_SATURATION_FACTOR = 2;
const DEFAULT_THROTTLE_LOCAL_FALLBACK_FACTOR = 1;
// Conservative default for fallback limiter memory; scales to ~2.5 million requests per hour
const DEFAULT_THROTTLE_LOCAL_CACHE_MAX_ENTRIES = 10000;
// Total budget for all DynamoDB calls per request; comfortably under API Gateway timeout
const DEFAULT_THROTTLE_STORE_DEADLINE_MILLISECONDS = 500;
const DEFAULT_THROTTLE_STORE_MAX_ATTEMPTS = 3;

const requiredString = z
  .string({ required_error: 'is required' })
  .trim()
  .min(1, 'must not be empty');

const requiredUrl = requiredString.url('must be a valid URL');

// Blank and unset both mean "not configured" — the compose-local case in
// .env.example leaves the line present but empty rather than removing it.
const optionalUrl = z
  .string()
  .optional()
  .transform((value) =>
    value === undefined || value.trim() === '' ? undefined : value,
  )
  .pipe(z.string().url('must be a valid URL').optional());

// Env values arrive as strings (or undefined); coerce to a validated number
// rather than casting, per the TypeScript lens's boundary-parsing rule.
const positiveIntegerWithDefault = (defaultValue: number) =>
  z
    .string()
    .optional()
    .transform((value) =>
      value === undefined || value.trim() === '' ? String(defaultValue) : value,
    )
    .pipe(
      z
        .string()
        .regex(/^[0-9]+$/, 'must be a positive integer')
        .transform(Number)
        .pipe(z.number().int().positive('must be a positive integer')),
    );

const rawEnvironmentSchema = z.object({
  TABLE_NAME: requiredString,
  AWS_REGION: requiredString,
  DYNAMODB_ENDPOINT: optionalUrl,
  JWT_ISSUER: requiredUrl,
  JWT_AUDIENCE: requiredString,
  ACCESS_TOKEN_TTL_SECONDS: positiveIntegerWithDefault(
    DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
  ),
  REFRESH_TOKEN_TTL_SECONDS: positiveIntegerWithDefault(
    DEFAULT_REFRESH_TOKEN_TTL_SECONDS,
  ),
  SESSION_CEILING_SECONDS: positiveIntegerWithDefault(
    DEFAULT_SESSION_CEILING_SECONDS,
  ),
  SIGNING_KEY_PARAMETER_NAME: requiredString,
  VERIFICATION_KEYS_PARAMETER_NAME: requiredString,
  THROTTLE_CREDENTIALS_LIMIT: positiveIntegerWithDefault(
    DEFAULT_THROTTLE_CREDENTIALS_LIMIT,
  ),
  THROTTLE_CREDENTIALS_WINDOW_SECONDS: positiveIntegerWithDefault(
    DEFAULT_THROTTLE_CREDENTIALS_WINDOW_SECONDS,
  ),
  THROTTLE_REFRESH_LIMIT: positiveIntegerWithDefault(
    DEFAULT_THROTTLE_REFRESH_LIMIT,
  ),
  THROTTLE_REFRESH_WINDOW_SECONDS: positiveIntegerWithDefault(
    DEFAULT_THROTTLE_REFRESH_WINDOW_SECONDS,
  ),
  THROTTLE_JWKS_LIMIT: positiveIntegerWithDefault(DEFAULT_THROTTLE_JWKS_LIMIT),
  THROTTLE_JWKS_WINDOW_SECONDS: positiveIntegerWithDefault(
    DEFAULT_THROTTLE_JWKS_WINDOW_SECONDS,
  ),
  THROTTLE_AUTHENTICATED_LIMIT: positiveIntegerWithDefault(
    DEFAULT_THROTTLE_AUTHENTICATED_LIMIT,
  ),
  THROTTLE_AUTHENTICATED_WINDOW_SECONDS: positiveIntegerWithDefault(
    DEFAULT_THROTTLE_AUTHENTICATED_WINDOW_SECONDS,
  ),
  THROTTLE_COUNTER_SATURATION_FACTOR: positiveIntegerWithDefault(
    DEFAULT_THROTTLE_COUNTER_SATURATION_FACTOR,
  ),
  THROTTLE_LOCAL_FALLBACK_FACTOR: positiveIntegerWithDefault(
    DEFAULT_THROTTLE_LOCAL_FALLBACK_FACTOR,
  ),
  THROTTLE_LOCAL_CACHE_MAX_ENTRIES: positiveIntegerWithDefault(
    DEFAULT_THROTTLE_LOCAL_CACHE_MAX_ENTRIES,
  ),
  THROTTLE_STORE_DEADLINE_MILLISECONDS: positiveIntegerWithDefault(
    DEFAULT_THROTTLE_STORE_DEADLINE_MILLISECONDS,
  ),
  THROTTLE_STORE_MAX_ATTEMPTS: positiveIntegerWithDefault(
    DEFAULT_THROTTLE_STORE_MAX_ATTEMPTS,
  ),
});

type RawEnvironment = z.infer<typeof rawEnvironmentSchema>;

/**
 * The service's parsed, camelCase configuration. Field names diverge from
 * their SCREAMING_SNAKE environment counterparts deliberately — this is the
 * single place that mapping is declared, per the naming lens.
 */
export interface AppConfig {
  tableName: string;
  awsRegion: string;
  dynamodbEndpoint?: string;
  jwtIssuer: string;
  jwtAudience: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  sessionCeilingSeconds: number;
  signingKeyParameterName: string;
  verificationKeysParameterName: string;
  throttleCredentialsLimit: number;
  throttleCredentialsWindowSeconds: number;
  throttleRefreshLimit: number;
  throttleRefreshWindowSeconds: number;
  throttleJwksLimit: number;
  throttleJwksWindowSeconds: number;
  throttleAuthenticatedLimit: number;
  throttleAuthenticatedWindowSeconds: number;
  throttleCounterSaturationFactor: number;
  throttleLocalFallbackFactor: number;
  throttleLocalCacheMaxEntries: number;
  throttleStoreDeadlineMilliseconds: number;
  throttleStoreMaxAttempts: number;
}

// The subset of `AppConfig` keys `toThrottleConfig` populates. Listed once
// more here rather than derived, since TypeScript has no first-class
// "fields added after this comment" operator — but the two functions below
// use it on both sides (`Omit<AppConfig, ThrottleConfigKey>` and
// `Record<ThrottleConfigKey, number>`), so adding a throttle field to
// `AppConfig` without adding it here fails `toAppConfig`'s merge to compile
// (an excess or missing property), rather than silently compiling.
type ThrottleConfigKey =
  | 'throttleCredentialsLimit'
  | 'throttleCredentialsWindowSeconds'
  | 'throttleRefreshLimit'
  | 'throttleRefreshWindowSeconds'
  | 'throttleJwksLimit'
  | 'throttleJwksWindowSeconds'
  | 'throttleAuthenticatedLimit'
  | 'throttleAuthenticatedWindowSeconds'
  | 'throttleCounterSaturationFactor'
  | 'throttleLocalFallbackFactor'
  | 'throttleLocalCacheMaxEntries'
  | 'throttleStoreDeadlineMilliseconds'
  | 'throttleStoreMaxAttempts';

// Split from a single 27-line mapping (task-3 review: past the 4-20 line
// convention) into one function per variable group. Each half stays a
// plain one-to-one field mapping; `toAppConfig` itself is back to a merge.
function toAuthAndPersistenceConfig(
  raw: RawEnvironment,
): Omit<AppConfig, ThrottleConfigKey> {
  return {
    tableName: raw.TABLE_NAME,
    awsRegion: raw.AWS_REGION,
    dynamodbEndpoint: raw.DYNAMODB_ENDPOINT,
    jwtIssuer: raw.JWT_ISSUER,
    jwtAudience: raw.JWT_AUDIENCE,
    accessTokenTtlSeconds: raw.ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlSeconds: raw.REFRESH_TOKEN_TTL_SECONDS,
    sessionCeilingSeconds: raw.SESSION_CEILING_SECONDS,
    signingKeyParameterName: raw.SIGNING_KEY_PARAMETER_NAME,
    verificationKeysParameterName: raw.VERIFICATION_KEYS_PARAMETER_NAME,
  };
}

function toThrottleConfig(
  raw: RawEnvironment,
): Record<ThrottleConfigKey, number> {
  return {
    throttleCredentialsLimit: raw.THROTTLE_CREDENTIALS_LIMIT,
    throttleCredentialsWindowSeconds: raw.THROTTLE_CREDENTIALS_WINDOW_SECONDS,
    throttleRefreshLimit: raw.THROTTLE_REFRESH_LIMIT,
    throttleRefreshWindowSeconds: raw.THROTTLE_REFRESH_WINDOW_SECONDS,
    throttleJwksLimit: raw.THROTTLE_JWKS_LIMIT,
    throttleJwksWindowSeconds: raw.THROTTLE_JWKS_WINDOW_SECONDS,
    throttleAuthenticatedLimit: raw.THROTTLE_AUTHENTICATED_LIMIT,
    throttleAuthenticatedWindowSeconds:
      raw.THROTTLE_AUTHENTICATED_WINDOW_SECONDS,
    throttleCounterSaturationFactor: raw.THROTTLE_COUNTER_SATURATION_FACTOR,
    throttleLocalFallbackFactor: raw.THROTTLE_LOCAL_FALLBACK_FACTOR,
    throttleLocalCacheMaxEntries: raw.THROTTLE_LOCAL_CACHE_MAX_ENTRIES,
    throttleStoreDeadlineMilliseconds: raw.THROTTLE_STORE_DEADLINE_MILLISECONDS,
    throttleStoreMaxAttempts: raw.THROTTLE_STORE_MAX_ATTEMPTS,
  };
}

function toAppConfig(raw: RawEnvironment): AppConfig {
  return { ...toAuthAndPersistenceConfig(raw), ...toThrottleConfig(raw) };
}

// zod's issue.path is the object key, which for this schema is already the
// SCREAMING_SNAKE variable name — so naming the offending variable is just
// echoing the path, never a separate lookup table to keep in sync.
function formatEnvironmentError(error: z.ZodError): string {
  const details = error.issues
    .map((issue) => `${issue.path.join('.')} ${issue.message}`)
    .join('; ');
  return `invalid environment configuration: ${details}`;
}

/**
 * Parses and validates `process.env` into the typed application config.
 * Throws synchronously on the first missing or malformed variable — called
 * once, at startup, from {@link ConfigurationModule}.
 */
export function parseAppConfig(
  env: Record<string, string | undefined>,
): AppConfig {
  const result = rawEnvironmentSchema.safeParse(env);
  if (!result.success) {
    // SPEC_DEVIATION: raw throw new Error, banned by the constitution — bootstrap-time
    // config validation never reaches the HTTP error taxonomy, so it's out of that
    // filter's scope (see problem-details.filter.ts).
    throw new Error(formatEnvironmentError(result.error));
  }
  return toAppConfig(result.data);
}
