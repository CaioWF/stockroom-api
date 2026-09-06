/**
 * Documentation-only success-response schemas for the generated OpenAPI
 * document (AC-26). Each mirrors an existing response-body interface —
 * `RegisterResponseBody` (auth.controller.ts), `AuthenticateAccountResult`
 * (authenticate-account.usecase.ts, also `RotateRefreshToken`'s success
 * shape), `DescribeCallerResult` (describe-caller.usecase.ts), and the JWK
 * Set body (jwks.controller.ts) without importing those interfaces directly,
 * since none of them are zod schemas themselves.
 */
import './extend-zod';

import { z } from 'zod';

export const RegisterResponseSchema = z
  .object({
    accountId: z.string().openapi({
      example: '018f7f1e-6b1a-7c3d-8b2a-1e2f3a4b5c6d',
    }),
    email: z.string().openapi({ example: 'merchant@example.com' }),
  })
  .openapi('RegisterResponse');

export const TokenPairResponseSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
    expiresIn: z.number().int().openapi({ example: 900 }),
    refreshExpiresIn: z.number().int().openapi({ example: 604800 }),
  })
  .openapi('TokenPairResponse');

export const MeResponseSchema = z
  .object({
    accountId: z.string().openapi({
      example: '018f7f1e-6b1a-7c3d-8b2a-1e2f3a4b5c6d',
    }),
    email: z.string().openapi({ example: 'merchant@example.com' }),
  })
  .openapi('MeResponse');

export const JwksResponseSchema = z
  .object({
    keys: z.array(z.record(z.string(), z.unknown())).openapi({
      description: 'RFC 7517 JSON Web Key Set (FR9)',
    }),
  })
  .openapi('JwksResponse');
