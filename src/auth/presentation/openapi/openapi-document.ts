/**
 * Builds the OpenAPI document served at `GET /openapi.json` (FR26, AC-26).
 *
 * Two-layer-validation resolution (a controller-approved judgment call,
 * same weight as Task 10's `jose`/`@node-rs/argon2` choice): request
 * validation in this codebase is deliberately two layers — a thin
 * structural zod `shapeSchema` per route (field presence only, see each
 * `src/auth/presentation/dto/*.ts`'s own JSDoc for why a second independent
 * validation layer there would risk producing errors outside FR24's closed
 * set) and the actual constraint enforcement in the domain value objects'
 * `.parse()` methods (`EmailAddress`, `RawPassword`,
 * `RefreshTokenCredential`), which are plain TypeScript classes, not zod
 * schemas.
 *
 * FR26 reads "generated from the same schemas that validate requests."
 * This implementation satisfies that with the WEAKER of the two readings
 * the task brief lays out: request-schemas.ts's schemas are
 * documentation-only, never `.parse()`d against a real body — the thin
 * `shapeSchema`s plus the domain parsers remain the only things that
 * actually validate a request, completely unchanged by this feature. The
 * REJECTED alternative — rebuilding each route's request schema to wrap the
 * domain value objects so the generated document is provably backed by the
 * exact code path that runs — was rejected for three reasons: (1) it would
 * require exporting currently-private constants out of `src/auth/domain/**`,
 * which is outside this task's file scope; (2) it would add a THIRD
 * validation surface (thin shape schema, domain parse, richer zod-for-docs
 * schema) needing manual sync with the domain constants anyway — trading
 * one drift risk for a different one, not eliminating it; (3) these
 * controllers call `parseXRequest(body)` explicitly in each handler rather
 * than relying on a Nest validation pipe, so there is no framework
 * mechanism that would let a "fuller" zod schema become the thing that
 * actually runs against the wire body without rewriting request handling
 * itself, which is out of scope for a contract-publishing task.
 *
 * request-schemas.ts's numeric bounds and patterns are copied verbatim from
 * the domain files, with the source cited inline, so a reader auditing the
 * document can confirm by eye that nothing was invented — but they are
 * documentation, not a second enforcement path, and must be updated by hand
 * if a domain constraint ever changes.
 *
 * Package choice: `@asteasolutions/zod-to-openapi` (pinned to the 7.x line,
 * the last major compatible with the installed zod 3.x — 8.x/9.x require
 * zod ^4). Chosen over `@nestjs/swagger` because this codebase has no
 * class-validator DTOs for `@nestjs/swagger`'s decorator/reflection-based
 * generation to read — every request/response shape here is a zod schema
 * or a plain interface, so a library that turns zod schemas directly into
 * an OpenAPI document is the fit with no adapter layer in between. Verified
 * against the actually-installed 7.3.4 package's own `.d.ts` output (its
 * README ships `zod/v4` import examples that do not apply to this
 * zod-v3-compatible major; the real API imports plain `zod`, confirmed by
 * reading `dist/zod-extensions.d.ts` and `dist/openapi-registry.d.ts`
 * directly rather than trusting the README).
 */
import './extend-zod';

import {
  OpenApiGeneratorV3,
  OpenAPIRegistry,
} from '@asteasolutions/zod-to-openapi';
import type { ResponseConfig } from '@asteasolutions/zod-to-openapi';
import type { OpenAPIObject } from 'openapi3-ts/oas30';

import { ProblemDetailsSchema } from './problem-schema';
import {
  LoginRequestSchema,
  RefreshRequestSchema,
  RegisterRequestSchema,
} from './request-schemas';
import {
  HealthResponseSchema,
  JwksResponseSchema,
  MeResponseSchema,
  RegisterResponseSchema,
  TokenPairResponseSchema,
} from './response-schemas';

const BEARER_AUTH_SCHEME = 'bearerAuth';

function problemResponse(description: string): ResponseConfig {
  return {
    description,
    content: { 'application/json': { schema: ProblemDetailsSchema } },
  };
}

function registerSecurityScheme(registry: OpenAPIRegistry): void {
  registry.registerComponent('securitySchemes', BEARER_AUTH_SCHEME, {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  });
}

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
    },
  });
}

function registerHealthRoute(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: 'get',
    path: '/health',
    summary: 'Liveness, touching neither storage nor the signing key (FR25)',
    responses: {
      200: {
        description: 'Live',
        content: { 'application/json': { schema: HealthResponseSchema } },
      },
    },
  });
}

function buildRegistry(): OpenAPIRegistry {
  const registry = new OpenAPIRegistry();
  registerSecurityScheme(registry);
  registerRegisterRoute(registry);
  registerLoginRoute(registry);
  registerRefreshRoute(registry);
  registerMeRoute(registry);
  registerJwksRoute(registry);
  registerHealthRoute(registry);
  return registry;
}

export function buildOpenApiDocument(): OpenAPIObject {
  const generator = new OpenApiGeneratorV3(buildRegistry().definitions);
  return generator.generateDocument({
    openapi: '3.0.0',
    info: {
      title: 'Stockroom Authentication API',
      version: '1.0.0',
      description:
        'FR26: generated at process start, served at GET /openapi.json.',
    },
  });
}

// Built once at module load: the document has no per-request input, so
// every fetch of GET /openapi.json answers with the same value.
export const OPENAPI_DOCUMENT = buildOpenApiDocument();
