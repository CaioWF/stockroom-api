/**
 * `GET /openapi.json` (FR26, AC-26): the feature's whole contract, built
 * once at module load by `openapi/openapi-document.ts` — see that file's
 * module doc for exactly which schemas it is generated from and why.
 * Public, like every other route a caller with no credential yet must be
 * able to reach.
 */
import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import type { OpenAPIObject } from 'openapi3-ts/oas30';

import { OPENAPI_DOCUMENT } from './openapi/openapi-document';
import { Public } from './public.decorator';
import { NoThrottle } from '../../throttling/presentation/no-throttle.decorator';

@Controller()
export class OpenApiController {
  @Public()
  @NoThrottle()
  @Get('openapi.json')
  @HttpCode(HttpStatus.OK)
  document(): OpenAPIObject {
    return OPENAPI_DOCUMENT;
  }
}
