/**
 * Auth's OpenAPI path contribution. The shared registry builds the final
 * document; this module names only routes owned by auth.
 */
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import {
  BEARER_AUTH_SCHEME,
  OpenApiPathContributor,
  problemResponse,
  rateLimitResponse,
} from '../../../shared/presentation/openapi-registry';
import {
  LoginRequestSchema,
  RefreshRequestSchema,
  RegisterRequestSchema,
} from './request-schemas';
import {
  JwksResponseSchema,
  MeResponseSchema,
  RegisterResponseSchema,
  TokenPairResponseSchema,
} from './response-schemas';

function registerRegisterRoute(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: 'post',
    path: '/auth/register',
    summary: 'Create an account (FR1)',
    request: {
      body: {
        content: { 'application/json': { schema: RegisterRequestSchema } },
      },
    },
    responses: {
      201: {
        description: 'Account created',
        content: { 'application/json': { schema: RegisterResponseSchema } },
      },
      409: problemResponse('An account for this email already exists'),
      422: problemResponse('Invalid email or password length'),
      429: rateLimitResponse(),
      default: problemResponse('Problem detail (RFC 9457)'),
    },
  });
}

function registerLoginRoute(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: 'post',
    path: '/auth/login',
    summary: 'Sign in and receive a token pair (FR6)',
    request: {
      body: {
        content: { 'application/json': { schema: LoginRequestSchema } },
      },
    },
    responses: {
      200: {
        description: 'Signed in',
        content: { 'application/json': { schema: TokenPairResponseSchema } },
      },
      401: problemResponse('Invalid credentials'),
      429: rateLimitResponse(),
      default: problemResponse('Problem detail (RFC 9457)'),
    },
  });
}

function registerRefreshRoute(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: 'post',
    path: '/auth/refresh',
    summary: 'Rotate a refresh token for a new pair (FR16)',
    request: {
      body: {
        content: { 'application/json': { schema: RefreshRequestSchema } },
      },
    },
    responses: {
      200: {
        description: 'Rotated',
        content: { 'application/json': { schema: TokenPairResponseSchema } },
      },
      401: problemResponse('Invalid, reused, or expired refresh token'),
      429: rateLimitResponse(),
      default: problemResponse('Problem detail (RFC 9457)'),
    },
  });
}

function registerMeRoute(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: 'get',
    path: '/auth/me',
    summary: 'Describe the caller resolved from the access token (FR13)',
    security: [{ [BEARER_AUTH_SCHEME]: [] }],
    responses: {
      200: {
        description: 'Caller identity',
        content: { 'application/json': { schema: MeResponseSchema } },
      },
      401: problemResponse('Missing, invalid, or expired access token'),
      429: rateLimitResponse(),
      default: problemResponse('Problem detail (RFC 9457)'),
    },
  });
}

function registerJwksRoute(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: 'get',
    path: '/.well-known/jwks.json',
    summary: 'Publish every currently trusted verification key (FR9)',
    responses: {
      200: {
        description: 'JWK Set',
        content: { 'application/json': { schema: JwksResponseSchema } },
      },
      429: rateLimitResponse(),
    },
  });
}

export const authOpenApiPaths: OpenApiPathContributor = (
  registry: OpenAPIRegistry,
): void => {
  registerRegisterRoute(registry);
  registerLoginRoute(registry);
  registerRefreshRoute(registry);
  registerMeRoute(registry);
  registerJwksRoute(registry);
};
