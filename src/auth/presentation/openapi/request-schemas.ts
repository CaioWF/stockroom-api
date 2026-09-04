/**
 * Documentation-only request-body schemas for the generated OpenAPI
 * document (AC-26, FR26) — see openapi-document.ts's module doc for the
 * two-layer-validation resolution these exist to implement. Each numeric
 * bound and pattern below is copied VERBATIM from the domain value object
 * that actually enforces it, with the source cited so a reader can jump
 * straight to the enforcement code and confirm the numbers agree. These
 * schemas are never called with `.parse()` against a real request; only
 * `src/auth/presentation/dto/*.ts`'s thin shape schemas plus the domain
 * parsers do that (unchanged by this file).
 */
import './extend-zod';

import { z } from 'zod';

// Mirrors src/auth/domain/email-address.ts's SHAPE and MAX_LENGTH.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX_LENGTH = 254;

// Mirrors src/auth/domain/raw-password.ts's MIN_LENGTH and MAX_LENGTH.
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;

const CredentialsRequestSchema = z.object({
  email: z
    .string()
    .max(EMAIL_MAX_LENGTH)
    .regex(EMAIL_SHAPE)
    .openapi({ example: 'merchant@example.com' }),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH)
    .max(PASSWORD_MAX_LENGTH)
    .openapi({ example: 'correct horse battery staple' }),
});

export const RegisterRequestSchema =
  CredentialsRequestSchema.openapi('RegisterRequest');

export const LoginRequestSchema =
  CredentialsRequestSchema.openapi('LoginRequest');

// Mirrors src/auth/domain/refresh-token-credential.ts's UUID_V7_PATTERN
// (used for both id segments) and SECRET_PATTERN, joined by the '.'
// separator the wire format uses.
const UUID_V7 =
  '[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const REFRESH_SECRET = '[A-Za-z0-9_-]{43}';
const REFRESH_TOKEN_SHAPE = new RegExp(
  `^${UUID_V7}\\.${UUID_V7}\\.${REFRESH_SECRET}$`,
);

export const RefreshRequestSchema = z
  .object({
    refreshToken: z.string().regex(REFRESH_TOKEN_SHAPE).openapi({
      description:
        '<accountId>.<tokenId>.<secret>, each a UUIDv7 except the base64url secret',
    }),
  })
  .openapi('RefreshRequest');
