import { Controller, Get, HttpCode, HttpStatus, Query } from '@nestjs/common';

import { ListCatalog } from '../application/list-catalog.usecase';
import {
  CatalogPageResponseBody,
  toCatalogPageResponse,
} from './dto/catalog-page.response';
import { parseListCatalogQuery } from './dto/list-catalog-query.schema';

@Controller('products')
export class CatalogController {
  constructor(private readonly listCatalog: ListCatalog) {}

  // The route stays behind the global guard, so an unauthenticated caller
  // never reaches here. It reads no claim: there is one catalog and the token
  // decides whether a caller may read, never which products it sees
  // (ADR-0007).
  @Get()
  @HttpCode(HttpStatus.OK)
  async list(@Query() query: unknown): Promise<CatalogPageResponseBody> {
    const { limit, cursor } = parseListCatalogQuery(query);
    const result = await this.listCatalog.execute({ limit, cursor });
    return toCatalogPageResponse(result);
  }
}
