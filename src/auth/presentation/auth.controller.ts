/**
 * The four HTTP routes this feature exposes so far (FR1, FR6, FR13-FR18).
 * Each handler's shape is the same: parse the body through its schema (the
 * only place a raw request value is trusted), call exactly one use case,
 * shape the result onto the wire. `register`/`login`/`refresh` are
 * `@Public()` (FR11) — `me` is not, so `JwtAuthGuard` (registered globally)
 * verifies its Bearer token before this class ever runs.
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';

import { AuthenticateAccount } from '../application/authenticate-account.usecase';
import type { AuthenticateAccountResult } from '../application/authenticate-account.usecase';
import { DescribeCaller } from '../application/describe-caller.usecase';
import type { DescribeCallerResult } from '../application/describe-caller.usecase';
import { RegisterAccount } from '../application/register-account.usecase';
import type { RegisterAccountResult } from '../application/register-account.usecase';
import { RotateRefreshToken } from '../application/rotate-refresh-token.usecase';
import type {
  RotatedOutcome,
  RotationOutcome,
} from '../domain/rotation-outcome';
import { StructuredLogger } from '../../shared/observability/structured-logger';

import { parseLoginRequest } from './dto/login-request.schema';
import { parseRegisterRequest } from './dto/register-request.schema';
import { parseRefreshRequest } from './dto/refresh-request.schema';
import type { AuthClaims, AuthenticatedRequest } from './jwt-auth.guard';
import { MissingAuthClaimsError } from './missing-auth-claims.error';
import { Public } from './public.decorator';
import { RefreshRejectedError } from './refresh-rejected.error';
import { ThrottleGroup } from '../../throttling/presentation/throttle-group.decorator';

interface RegisterResponseBody {
  readonly accountId: string;
  readonly email: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerAccount: RegisterAccount,
    private readonly authenticateAccount: AuthenticateAccount,
    private readonly rotateRefreshToken: RotateRefreshToken,
    private readonly describeCaller: DescribeCaller,
    private readonly structuredLogger: StructuredLogger,
  ) {}

  @Public()
  @ThrottleGroup('credentials')
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() body: unknown): Promise<RegisterResponseBody> {
    const { email, password } = parseRegisterRequest(body);
    const result = await this.registerAccount.execute(email, password);
    return this.toRegisterResponse(result);
  }

  @Public()
  @ThrottleGroup('credentials')
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: unknown): Promise<AuthenticateAccountResult> {
    const { email, password } = parseLoginRequest(body);
    return this.authenticateAccount.execute(email, password);
  }

  @Public()
  @ThrottleGroup('refresh')
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() body: unknown): Promise<AuthenticateAccountResult> {
    const { credential } = parseRefreshRequest(body);
    const outcome = await this.rotateRefreshToken.execute(credential);
    return this.toRefreshResponse(outcome);
  }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  me(@Req() request: AuthenticatedRequest): DescribeCallerResult {
    return this.describeCaller.execute(this.requireAuthClaims(request));
  }

  private toRegisterResponse(
    result: RegisterAccountResult,
  ): RegisterResponseBody {
    return { accountId: result.accountId, email: result.email.toString() };
  }

  // AC-14: 'rotated' returns the same four-field shape login already uses.
  // Every other outcome refuses (FR18: logging the anomaly, when there is
  // one, happens here — the only place in this feature that call happens).
  private toRefreshResponse(
    outcome: RotationOutcome,
  ): AuthenticateAccountResult {
    if (outcome.kind === 'rotated') {
      return this.toRotatedResponse(outcome);
    }
    this.logAnomalyIfPresent(outcome);
    throw new RefreshRejectedError();
  }

  private toRotatedResponse(
    outcome: RotatedOutcome,
  ): AuthenticateAccountResult {
    return {
      accessToken: outcome.accessToken,
      refreshToken: outcome.refreshToken,
      expiresIn: outcome.expiresIn,
      refreshExpiresIn: outcome.refreshExpiresIn,
    };
  }

  private logAnomalyIfPresent(
    outcome: Exclude<RotationOutcome, RotatedOutcome>,
  ): void {
    if (outcome.kind === 'benign-replay' || outcome.kind === 'reuse-detected') {
      this.structuredLogger.log({
        event: 'anomaly',
        outcome: outcome.kind,
        accountId: outcome.accountId,
      });
    }
  }

  // Defensive only: JwtAuthGuard always attaches claims before letting a
  // non-public request reach this handler, so a missing value here means an
  // invariant broke elsewhere, not a caller-triggerable path.
  private requireAuthClaims(request: AuthenticatedRequest): AuthClaims {
    if (request.authClaims === undefined) {
      throw new MissingAuthClaimsError();
    }
    return request.authClaims;
  }
}
