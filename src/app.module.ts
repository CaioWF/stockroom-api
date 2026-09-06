import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { AuthModule } from './auth/auth.module';
import { authProblemMappings } from './auth/presentation/auth-problem-mappings';
import { authOpenApiPaths } from './auth/presentation/openapi/openapi-document';
import { OpenApiController } from './auth/presentation/openapi.controller';
import { CatalogModule } from './catalog/catalog.module';
import { catalogOpenApiPaths } from './catalog/presentation/catalog-openapi-paths';
import { catalogProblemMappings } from './catalog/presentation/catalog-problem-mappings';
import { HealthModule } from './health/health.module';
import { healthOpenApiPaths } from './health/health-openapi-paths';
import { ProblemDetailsFilter } from './shared/presentation/problem-details.filter';
import { PROBLEM_MAPPINGS } from './shared/presentation/problem-mapping';
import {
  buildOpenApiDocument,
  OPENAPI_DOCUMENT,
  OPENAPI_PATHS,
  OpenApiPathContributor,
} from './shared/presentation/openapi-registry';
import { ThrottlingModule } from './throttling/throttling.module';
import { throttlingProblemMappings } from './throttling/presentation/throttling-problem-mappings';

// Composition root. Feature modules (auth, health, shared/*) register here
// as later tasks add them — see plan.md's File Structure.
@Module({
  imports: [AuthModule, HealthModule, ThrottlingModule, CatalogModule],
  controllers: [OpenApiController],
  providers: [
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    {
      provide: PROBLEM_MAPPINGS,
      useValue: [
        authProblemMappings,
        throttlingProblemMappings,
        catalogProblemMappings,
      ],
    },
    {
      provide: OPENAPI_PATHS,
      useValue: [authOpenApiPaths, healthOpenApiPaths, catalogOpenApiPaths],
    },
    {
      provide: OPENAPI_DOCUMENT,
      useFactory: (
        contributors: readonly OpenApiPathContributor[],
      ): ReturnType<typeof buildOpenApiDocument> =>
        buildOpenApiDocument(contributors),
      inject: [OPENAPI_PATHS],
    },
  ],
})
export class AppModule {}
