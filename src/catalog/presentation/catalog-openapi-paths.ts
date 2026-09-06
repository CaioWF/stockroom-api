import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

import {
  BEARER_AUTH_SCHEME,
  OpenApiPathContributor,
  problemResponse,
  rateLimitResponse,
} from '../../shared/presentation/openapi-registry';
import { CatalogPageResponseSchema } from './dto/catalog-page.response';

export const catalogOpenApiPaths: OpenApiPathContributor = (
  registry: OpenAPIRegistry,
): void => {
  registry.registerPath({
    method: 'get',
    path: '/products',
    summary: 'List products for the authenticated account',
    security: [{ [BEARER_AUTH_SCHEME]: [] }],
    request: {
      query: z.object({
        limit: z.string().optional(),
        cursor: z.string().optional(),
      }),
    },
    responses: {
      200: {
        description: 'Catalog page',
        content: { 'application/json': { schema: CatalogPageResponseSchema } },
      },
      401: problemResponse('Missing, invalid, or expired access token'),
      422: problemResponse('Invalid paging input'),
      429: rateLimitResponse(),
      default: problemResponse('Problem detail (RFC 9457)'),
    },
  });
};
