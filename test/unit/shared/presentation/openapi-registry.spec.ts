import { readFileSync } from 'node:fs';
import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import {
  buildOpenApiDocument,
  OpenApiPathContributor,
} from '../../../../src/shared/presentation/openapi-registry';

describe('openapi path registry', () => {
  it('builds a document from path contributors registered at the composition root', () => {
    const first: OpenApiPathContributor = (registry: OpenAPIRegistry) => {
      registry.registerPath({
        method: 'get',
        path: '/first',
        responses: { 200: { description: 'first response' } },
      });
    };
    const second: OpenApiPathContributor = (registry: OpenAPIRegistry) => {
      registry.registerPath({
        method: 'post',
        path: '/second',
        responses: { 201: { description: 'second response' } },
      });
    };

    const document = buildOpenApiDocument([first, second]);

    expect(document.paths['/first']?.get).toBeDefined();
    expect(document.paths['/second']?.post).toBeDefined();
  });

  it('keeps auth from importing peer contexts to publish routes', () => {
    const authOpenApiSource = readFileSync(
      'src/auth/presentation/openapi/openapi-document.ts',
      'utf8',
    );

    expect(authOpenApiSource).not.toContain('catalogOpenApiPaths');
  });

  it('keeps health from importing auth to publish its own route', () => {
    const healthOpenApiSource = readFileSync(
      'src/health/health-openapi-paths.ts',
      'utf8',
    );

    expect(healthOpenApiSource).not.toContain('../auth/');
  });
});
