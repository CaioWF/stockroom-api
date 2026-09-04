/**
 * Minimal structural check for `POST /auth/register`, then a straight
 * handoff to the domain parsers (FR24's closed error-code set): building a
 * second, independent validation layer here could produce errors outside
 * the closed set the exception filter is allowed to render. `.catch()`
 * means this never throws its own `ZodError` for a malformed or non-object
 * body — a missing key, or `body` not even being an object, both collapse
 * to `{ email: undefined, password: undefined }`, which `EmailAddress.parse`/
 * `RawPassword.parse` already turn into their own typed, closed-set errors
 * (both handle non-string input, including `undefined`, themselves).
 */

import { z } from 'zod';

import { EmailAddress } from '../../domain/email-address';
import { RawPassword } from '../../domain/raw-password';

const shapeSchema = z
  .object({ email: z.unknown(), password: z.unknown() })
  .catch({ email: undefined, password: undefined });

export interface RegisterRequest {
  readonly email: EmailAddress;
  readonly password: RawPassword;
}

export function parseRegisterRequest(body: unknown): RegisterRequest {
  const shape = shapeSchema.parse(body);
  return {
    email: EmailAddress.parse(shape.email),
    password: RawPassword.parse(shape.password),
  };
}
