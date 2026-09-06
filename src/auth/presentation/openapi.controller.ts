/**
 * `GET /openapi.json` serves the whole published contract assembled by the
 * composition root from every bounded context's path contribution.
 * Public, like every other route a caller with no credential yet must be
 * able to reach.
 */
import { Controller, Get, HttpCode, HttpStatus, Inject } from '@nestjs/common';
import type { OpenAPIObject } from 'openapi3-ts/oas30';

import { OPENAPI_DOCUMENT } from '../../shared/presentation/openapi-registry';
import { Public } from './public.decorator';
import { NoThrottle } from '../../throttling/presentation/no-throttle.decorator';

@Controller()
export class OpenApiController {
  constructor(
    @Inject(OPENAPI_DOCUMENT) private readonly documentBody: OpenAPIObject,
  ) {}

  @Public()
  @NoThrottle()
  @Get('openapi.json')
  @HttpCode(HttpStatus.OK)
  document(): OpenAPIObject {
    return this.documentBody;
  }
}
