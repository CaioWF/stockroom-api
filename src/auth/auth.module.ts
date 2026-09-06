/**
 * The composition root for the whole feature (Task 13): wires every
 * domain/application unit from Tasks 5-9 to the concrete adapters built in
 * Tasks 10-12, then exposes the four routes through `AuthController`.
 *
 * DI tokens for the eight ports are `Symbol`s defined here — this is the
 * first (and only) place any of them is wired to a concrete adapter, same
 * reasoning `APP_CONFIG`/`DYNAMO_DOCUMENT_CLIENT` already establish for an
 * interface-shaped value with no runtime class of its own. Every provider
 * is a `useFactory` that constructs its adapter manually (mirroring how
 * `dynamo-client.provider.ts` builds `DYNAMO_DOCUMENT_CLIENT`), so none of
 * the adapter classes themselves need framework injection decorators.
 *
 * Production wiring always uses the real Parameter-Store-backed key
 * providers — e2e tests swap `SIGNING_KEY_PROVIDER`/
 * `VERIFICATION_KEY_SET_PROVIDER` for an in-memory double via Nest's
 * testing-module `overrideProvider`, never by changing this file.
 */

import { SSMClient } from '@aws-sdk/client-ssm';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { Module, Provider } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';

import {
  ConfigurationModule,
  APP_CONFIG,
} from '../shared/config/configuration.module';
import type { AppConfig } from '../shared/config/environment.schema';
import { PersistenceModule } from '../shared/persistence/persistence.module';
import { DYNAMO_DOCUMENT_CLIENT } from '../shared/persistence/dynamo-client.provider';
import { ObservabilityModule } from '../shared/observability/observability.module';

import { AuthenticateAccount } from './application/authenticate-account.usecase';
import { DescribeCaller } from './application/describe-caller.usecase';
import { RegisterAccount } from './application/register-account.usecase';
import { RotateRefreshToken } from './application/rotate-refresh-token.usecase';

import type { AccessTokenSigner } from './domain/ports/access-token-signer';
import type { Clock } from './domain/ports/clock';
import type { IdGenerator } from './domain/ports/id-generator';
import type { PasswordHasher } from './domain/ports/password-hasher';
import type { RefreshTokenRepository } from './domain/ports/refresh-token-repository';
import type { SigningKeyProvider } from './domain/ports/signing-key-provider';
import type { UserRepository } from './domain/ports/user-repository';
import type { VerificationKeySetProvider } from './domain/ports/verification-key-set-provider';

import { Argon2PasswordHasher } from './infrastructure/crypto/argon2-password-hasher';
import { Rs256AccessTokenSigner } from './infrastructure/crypto/rs256-access-token-signer';
import { SystemClock } from './infrastructure/crypto/system-clock';
import { UuidV7Generator } from './infrastructure/crypto/uuid-v7-generator';
import { DynamoRefreshTokenRepository } from './infrastructure/dynamo/refresh-token.repository';
import { DynamoUserRepository } from './infrastructure/dynamo/user.repository';
import { ParameterStoreSigningKeyProvider } from './infrastructure/keys/parameter-store-signing-key.provider';
import { ParameterStoreVerificationKeySetProvider } from './infrastructure/keys/parameter-store-verification-key-set.provider';

import { AuthController } from './presentation/auth.controller';
import { JwksController } from './presentation/jwks.controller';
import { JwtAuthGuard } from './presentation/jwt-auth.guard';
import { VERIFICATION_KEY_SET_PROVIDER } from './verification-key-set-provider.token';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
export const REFRESH_TOKEN_REPOSITORY = Symbol('REFRESH_TOKEN_REPOSITORY');
export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');
export const ID_GENERATOR = Symbol('ID_GENERATOR');
export const CLOCK = Symbol('CLOCK');
export const ACCESS_TOKEN_SIGNER = Symbol('ACCESS_TOKEN_SIGNER');
export const SIGNING_KEY_PROVIDER = Symbol('SIGNING_KEY_PROVIDER');
// Re-exported (not declared here) so JwksController can inject it without a
// require() cycle with this module — see verification-key-set-provider.token.ts.
export { VERIFICATION_KEY_SET_PROVIDER } from './verification-key-set-provider.token';
const SSM_CLIENT = Symbol('SSM_CLIENT');

const ssmClientProvider: Provider = {
  provide: SSM_CLIENT,
  useFactory: (config: AppConfig): SSMClient =>
    new SSMClient({ region: config.awsRegion }),
  inject: [APP_CONFIG],
};

const signingKeyProviderProvider: Provider = {
  provide: SIGNING_KEY_PROVIDER,
  useFactory: (ssmClient: SSMClient, config: AppConfig): SigningKeyProvider =>
    new ParameterStoreSigningKeyProvider(
      ssmClient,
      config.signingKeyParameterName,
    ),
  inject: [SSM_CLIENT, APP_CONFIG],
};

const verificationKeySetProviderProvider: Provider = {
  provide: VERIFICATION_KEY_SET_PROVIDER,
  useFactory: (
    ssmClient: SSMClient,
    config: AppConfig,
  ): VerificationKeySetProvider =>
    new ParameterStoreVerificationKeySetProvider(
      ssmClient,
      config.verificationKeysParameterName,
    ),
  inject: [SSM_CLIENT, APP_CONFIG],
};

const userRepositoryProvider: Provider = {
  provide: USER_REPOSITORY,
  useFactory: (
    documentClient: DynamoDBDocumentClient,
    config: AppConfig,
  ): UserRepository =>
    new DynamoUserRepository(documentClient, config.tableName),
  inject: [DYNAMO_DOCUMENT_CLIENT, APP_CONFIG],
};

const refreshTokenRepositoryProvider: Provider = {
  provide: REFRESH_TOKEN_REPOSITORY,
  useFactory: (
    documentClient: DynamoDBDocumentClient,
    config: AppConfig,
  ): RefreshTokenRepository =>
    new DynamoRefreshTokenRepository(documentClient, config.tableName),
  inject: [DYNAMO_DOCUMENT_CLIENT, APP_CONFIG],
};

const passwordHasherProvider: Provider = {
  provide: PASSWORD_HASHER,
  useFactory: (): PasswordHasher => new Argon2PasswordHasher(),
};

const idGeneratorProvider: Provider = {
  provide: ID_GENERATOR,
  useFactory: (): IdGenerator => new UuidV7Generator(),
};

const clockProvider: Provider = {
  provide: CLOCK,
  useFactory: (): Clock => new SystemClock(),
};

const accessTokenSignerProvider: Provider = {
  provide: ACCESS_TOKEN_SIGNER,
  useFactory: (
    signingKeyProvider: SigningKeyProvider,
    clock: Clock,
    config: AppConfig,
  ): AccessTokenSigner =>
    new Rs256AccessTokenSigner(
      signingKeyProvider,
      clock,
      config.jwtIssuer,
      config.jwtAudience,
      config.accessTokenTtlSeconds,
    ),
  inject: [SIGNING_KEY_PROVIDER, CLOCK, APP_CONFIG],
};

const registerAccountProvider: Provider = {
  provide: RegisterAccount,
  useFactory: (
    userRepository: UserRepository,
    passwordHasher: PasswordHasher,
    idGenerator: IdGenerator,
  ): RegisterAccount =>
    new RegisterAccount(userRepository, passwordHasher, idGenerator),
  inject: [USER_REPOSITORY, PASSWORD_HASHER, ID_GENERATOR],
};

const authenticateAccountProvider: Provider = {
  provide: AuthenticateAccount,
  useFactory: (
    userRepository: UserRepository,
    passwordHasher: PasswordHasher,
    accessTokenSigner: AccessTokenSigner,
    refreshTokenRepository: RefreshTokenRepository,
    idGenerator: IdGenerator,
    clock: Clock,
    config: AppConfig,
  ): AuthenticateAccount =>
    new AuthenticateAccount(
      userRepository,
      passwordHasher,
      accessTokenSigner,
      refreshTokenRepository,
      idGenerator,
      clock,
      config.accessTokenTtlSeconds,
      config.refreshTokenTtlSeconds,
    ),
  inject: [
    USER_REPOSITORY,
    PASSWORD_HASHER,
    ACCESS_TOKEN_SIGNER,
    REFRESH_TOKEN_REPOSITORY,
    ID_GENERATOR,
    CLOCK,
    APP_CONFIG,
  ],
};

const rotateRefreshTokenProvider: Provider = {
  provide: RotateRefreshToken,
  useFactory: (
    refreshTokenRepository: RefreshTokenRepository,
    userRepository: UserRepository,
    accessTokenSigner: AccessTokenSigner,
    idGenerator: IdGenerator,
    clock: Clock,
    config: AppConfig,
  ): RotateRefreshToken =>
    new RotateRefreshToken(
      refreshTokenRepository,
      userRepository,
      accessTokenSigner,
      idGenerator,
      clock,
      config.accessTokenTtlSeconds,
      config.refreshTokenTtlSeconds,
      config.sessionCeilingSeconds,
    ),
  inject: [
    REFRESH_TOKEN_REPOSITORY,
    USER_REPOSITORY,
    ACCESS_TOKEN_SIGNER,
    ID_GENERATOR,
    CLOCK,
    APP_CONFIG,
  ],
};

const jwtAuthGuardProvider: Provider = {
  provide: APP_GUARD,
  useFactory: (
    reflector: Reflector,
    verificationKeySetProvider: VerificationKeySetProvider,
    config: AppConfig,
  ): JwtAuthGuard =>
    new JwtAuthGuard(reflector, verificationKeySetProvider, config),
  inject: [Reflector, VERIFICATION_KEY_SET_PROVIDER, APP_CONFIG],
};

@Module({
  imports: [ConfigurationModule, PersistenceModule, ObservabilityModule],
  controllers: [AuthController, JwksController],
  providers: [
    ssmClientProvider,
    signingKeyProviderProvider,
    verificationKeySetProviderProvider,
    userRepositoryProvider,
    refreshTokenRepositoryProvider,
    passwordHasherProvider,
    idGeneratorProvider,
    clockProvider,
    accessTokenSignerProvider,
    registerAccountProvider,
    authenticateAccountProvider,
    rotateRefreshTokenProvider,
    DescribeCaller,
    jwtAuthGuardProvider,
  ],
})
export class AuthModule {}
