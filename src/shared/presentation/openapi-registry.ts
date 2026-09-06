import './openapi/extend-zod';

import {
  OpenApiGeneratorV3,
  OpenAPIRegistry,
} from '@asteasolutions/zod-to-openapi';
import type { ResponseConfig } from '@asteasolutions/zod-to-openapi';
import type { OpenAPIObject } from 'openapi3-ts/oas30';

import { ProblemDetailsSchema } from './openapi/problem-schema';

export const OPENAPI_PATHS = Symbol('OPENAPI_PATHS');
export const OPENAPI_DOCUMENT = Symbol('OPENAPI_DOCUMENT');
export const BEARER_AUTH_SCHEME = 'bearerAuth';

export type OpenApiPathContributor = (registry: OpenAPIRegistry) => void;

export function problemResponse(description: string): ResponseConfig {
  return {
    description,
    content: { 'application/problem+json': { schema: ProblemDetailsSchema } },
  };
}

export function rateLimitResponse(): ResponseConfig {
  return {
    ...problemResponse('Rate limit exceeded'),
    headers: {
      'Retry-After': {
        description: 'Seconds to wait before retrying',
        schema: { type: 'integer', minimum: 1 },
      },
    },
  };
}

export function buildOpenApiDocument(
  contributors: readonly OpenApiPathContributor[],
): OpenAPIObject {
  const registry = new OpenAPIRegistry();
  registerSecurityScheme(registry);
  contributors.forEach((contributor) => contributor(registry));
  return generateDocument(registry);
}

function registerSecurityScheme(registry: OpenAPIRegistry): void {
  registry.registerComponent('securitySchemes', BEARER_AUTH_SCHEME, {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  });
}

function generateDocument(registry: OpenAPIRegistry): OpenAPIObject {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: '3.0.0',
    info: {
      title: 'Stockroom API',
      version: '1.0.0',
      description:
        'Generated at process start and served at GET /openapi.json.',
    },
  });
}
