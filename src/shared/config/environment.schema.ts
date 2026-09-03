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
}

function toAppConfig(raw: RawEnvironment): AppConfig {
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
    throw new Error(formatEnvironmentError(result.error));
  }
  return toAppConfig(result.data);
}
