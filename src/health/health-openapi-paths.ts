import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

import { OpenApiPathContributor } from '../shared/presentation/openapi-registry';
import '../shared/presentation/openapi/extend-zod';

const HealthResponseSchema = z
  .object({ status: z.literal('ok') })
  .openapi('HealthResponse');

export const healthOpenApiPaths: OpenApiPathContributor = (
  registry: OpenAPIRegistry,
): void => {
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
};
