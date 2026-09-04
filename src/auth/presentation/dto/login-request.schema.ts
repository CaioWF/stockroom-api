/**
 * Mirrors register-request.schema.ts exactly — same two fields, same
 * "structural check, then hand off to the domain parsers" reasoning. See
 * that file's own JSDoc for why `.catch()` is what keeps this from ever
 * throwing an error outside FR24's closed set.
 */

import { z } from 'zod';

import { EmailAddress } from '../../domain/email-address';
import { RawPassword } from '../../domain/raw-password';

const shapeSchema = z
  .object({ email: z.unknown(), password: z.unknown() })
  .catch({ email: undefined, password: undefined });

export interface LoginRequest {
  readonly email: EmailAddress;
  readonly password: RawPassword;
}

export function parseLoginRequest(body: unknown): LoginRequest {
  const shape = shapeSchema.parse(body);
  return {
    email: EmailAddress.parse(shape.email),
    password: RawPassword.parse(shape.password),
  };
}
