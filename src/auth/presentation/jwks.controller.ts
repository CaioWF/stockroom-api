/**
 * Publishes the current JWK Set (FR9, AC-13): unauthenticated, converting
 * each trusted key's SPKI PEM (`VerificationKeySetProvider`, Task 11) into a
 * JWK at request time — `importSPKI` then `exportJWK`, with `kid` set from
 * the port's own value rather than recomputed, since Task 11 already derives
 * it as the RFC 7638 thumbprint.
 *
 * Cache lifetime: an hour (`CACHE_LIFETIME_SECONDS`). Neither the spec nor
 * the plan pins an exact number — AC-13 only requires the header be
 * "explicit" — so this is a controller-approved judgment call: the set only
 * changes during a deliberate key rotation, and a rotation is expected to
 * publish the successor key well ahead of retiring the old one, so an
 * hour-stale cache is a safe, conservative default rather than a gap.
 *
 * `VERIFICATION_KEY_SET_PROVIDER` is imported from its own
 * `verification-key-set-provider.token.ts` file, not from `auth.module.ts`
 * like the other seven DI tokens: `auth.module.ts` registers this
 * controller, so declaring the token there too would make this file and
 * the module `require()` each other. The token lives in a file with no
 * dependency of its own instead, so both sides can import it plainly.
 */

import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { exportJWK, importSPKI, JWK } from 'jose';

import { VERIFICATION_KEY_SET_PROVIDER } from '../verification-key-set-provider.token';
import type {
  VerificationKey,
  VerificationKeySetProvider,
} from '../domain/ports/verification-key-set-provider';
import { Public } from './public.decorator';
import { ThrottleGroup } from '../../throttling/presentation/throttle-group.decorator';

const RS256_ALGORITHM = 'RS256';
const CACHE_LIFETIME_SECONDS = 3600;

interface JwkSetBody {
  readonly keys: readonly JWK[];
}

@Controller('.well-known')
export class JwksController {
  constructor(
    @Inject(VERIFICATION_KEY_SET_PROVIDER)
    private readonly verificationKeySetProvider: VerificationKeySetProvider,
  ) {}

  @Public()
  @ThrottleGroup('jwks')
  @Get('jwks.json')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', `public, max-age=${CACHE_LIFETIME_SECONDS}`)
  async jwks(): Promise<JwkSetBody> {
    const keys = await this.verificationKeySetProvider.getVerificationKeys();
    return { keys: await Promise.all(keys.map((key) => this.toJwk(key))) };
  }

  private async toJwk(key: VerificationKey): Promise<JWK> {
    const cryptoKey = await importSPKI(key.publicKey, RS256_ALGORITHM);
    const jwk = await exportJWK(cryptoKey);
    return { ...jwk, kid: key.kid };
  }
}
