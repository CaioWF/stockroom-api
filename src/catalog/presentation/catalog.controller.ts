import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  Req,
} from '@nestjs/common';

import { ListCatalog } from '../application/list-catalog.usecase';
import type { AuthenticatedRequest } from '../../auth/presentation/jwt-auth.guard';
import { MissingAuthClaimsError } from '../../auth/presentation/missing-auth-claims.error';
import {
  CatalogPageResponseBody,
  toCatalogPageResponse,
} from './dto/catalog-page.response';
import { parseListCatalogQuery } from './dto/list-catalog-query.schema';

@Controller('products')
export class CatalogController {
  constructor(private readonly listCatalog: ListCatalog) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(
    @Req() request: AuthenticatedRequest,
    @Query() query: unknown,
  ): Promise<CatalogPageResponseBody> {
    const { limit, cursor } = parseListCatalogQuery(query);
    const result = await this.listCatalog.execute({
      accountId: this.requireAccountId(request),
      limit,
      cursor,
    });
    return toCatalogPageResponse(result);
  }

  private requireAccountId(request: AuthenticatedRequest): string {
    if (request.authClaims === undefined) {
      throw new MissingAuthClaimsError();
    }
    return request.authClaims.accountId;
  }
}
