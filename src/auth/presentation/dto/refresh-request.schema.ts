/**
 * `POST /auth/refresh`'s one field, same "structural check, then hand off to
 * the domain parser" shape as register-request.schema.ts/login-request.schema.ts —
 * `RefreshTokenCredential.parse` is what produces AC-20's closed-set error
 * for a malformed wire token.
 */

import { z } from 'zod';

import { RefreshTokenCredential } from '../../domain/refresh-token-credential';

const shapeSchema = z
  .object({ refreshToken: z.unknown() })
  .catch({ refreshToken: undefined });

export interface RefreshRequest {
  readonly credential: RefreshTokenCredential;
}

export function parseRefreshRequest(body: unknown): RefreshRequest {
  const shape = shapeSchema.parse(body);
  return { credential: RefreshTokenCredential.parse(shape.refreshToken) };
}
