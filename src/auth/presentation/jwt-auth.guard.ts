/**
 * Default-deny access-token guard (FR11, FR12), registered globally via
 * `APP_GUARD` in auth.module.ts — every route requires a verified Bearer
 * access token unless `@Public()` marks it exempt.
 *
 * `options.algorithms: ['RS256']` is the single most security-critical line
 * in this feature: without it, `jose` accepts whatever algorithm the
 * token's own header claims, including `HS256` with the published RSA
 * public key bytes used as an HMAC secret (AC-10's algorithm-confusion
 * attack). Verified against the installed `jose@6.2.10`'s own source
 * (`jws_verify.js`'s `validateJwsHeaders`): the `algorithms` allow-list is
 * checked before the key resolver even runs, rejecting a disallowed `alg`
 * with `JOSEAlgNotAllowed` up front.
 *
 * `jose` checks `exp`/`iss`/`aud` against its own default clock
 * (`Date.now()`) during `jwtVerify` — the one place in this feature that
 * does not read the injected `Clock` port, since access-token verification
 * has no unit-test requirement for clock control (unlike refresh rotation)
 * and `jose`'s own default is standard, uncontroversial JWT behavior.
 *
 * Constructed manually via a `useFactory` in auth.module.ts (same pattern
 * the infrastructure adapters already use for their own dependencies), so
 * this class carries no framework injection decorators of its own.
 */

import {
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { KeyLike } from 'jose';
import { importSPKI, jwtVerify, JWTVerifyGetKey } from 'jose';

import type { AppConfig } from '../../shared/config/environment.schema';
import type {
  VerificationKey,
  VerificationKeySetProvider,
} from '../domain/ports/verification-key-set-provider';
import { IncompleteTokenClaimsError } from './incomplete-token-claims.error';
import { IS_PUBLIC_KEY } from './public.decorator';
import { UnknownVerificationKeyError } from './unknown-verification-key.error';

const RS256_ALGORITHM = 'RS256';
const BEARER_PREFIX = 'Bearer ';

export interface AuthClaims {
  readonly accountId: string;
  readonly email: string;
}

export interface AuthenticatedRequest extends Request {
  authClaims?: AuthClaims;
}

export class JwtAuthGuard implements CanActivate {
  // Keyed by `kid`, not a single field: `getVerificationKeys()` can hold two
  // trusted keys mid-rotation (the port's own JSDoc), and this guard is a
  // long-lived singleton, so caching by kid avoids redoing jose's
  // PEM->CryptoKey import on every guarded request for each trusted key.
  private readonly verificationKeyCache = new Map<string, Promise<KeyLike>>();

  constructor(
    private readonly reflector: Reflector,
    private readonly verificationKeySetProvider: VerificationKeySetProvider,
    private readonly appConfig: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.isPublicRoute(context)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request);
    request.authClaims = await this.verify(token);
    return true;
  }

  private isPublicRoute(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false
    );
  }

  // Missing header and a malformed Bearer value both collapse to the same
  // UnauthorizedException as a verification failure would (AC-9/10/11 all
  // want a uniform 401 with no distinguishing detail about *why*).
  private extractBearerToken(request: AuthenticatedRequest): string {
    const header = request.headers.authorization;
    if (header === undefined || !header.startsWith(BEARER_PREFIX)) {
      throw new UnauthorizedException();
    }
    return header.slice(BEARER_PREFIX.length);
  }

  private async verify(token: string): Promise<AuthClaims> {
    try {
      const { payload } = await jwtVerify(token, this.buildKeyResolver(), {
        algorithms: [RS256_ALGORITHM],
        issuer: this.appConfig.jwtIssuer,
        audience: this.appConfig.jwtAudience,
      });
      return this.toAuthClaims(payload.sub, payload.email);
    } catch {
      throw new UnauthorizedException();
    }
  }

  // `protectedHeader.kid` resolves the matching trusted key (FR12); an
  // unknown kid throws UnknownVerificationKeyError — caught by `verify`'s
  // try/catch above and folded into the same uniform 401.
  private buildKeyResolver(): JWTVerifyGetKey {
    return async (protectedHeader) => {
      const keys = await this.verificationKeySetProvider.getVerificationKeys();
      const match = keys.find((key) => key.kid === protectedHeader.kid);
      if (match === undefined) {
        throw new UnknownVerificationKeyError(String(protectedHeader.kid));
      }
      return this.importVerificationKey(match);
    };
  }

  private importVerificationKey(key: VerificationKey): Promise<KeyLike> {
    const cached = this.verificationKeyCache.get(key.kid);
    if (cached !== undefined) {
      return cached;
    }
    const imported = importSPKI(key.publicKey, RS256_ALGORITHM);
    this.verificationKeyCache.set(key.kid, imported);
    return imported;
  }

  private toAuthClaims(sub: unknown, email: unknown): AuthClaims {
    if (typeof sub !== 'string' || typeof email !== 'string') {
      throw new IncompleteTokenClaimsError();
    }
    return { accountId: sub, email };
  }
}
