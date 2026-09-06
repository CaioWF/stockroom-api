import { CatalogCursor } from '../catalog-cursor';
import { CatalogPage } from '../catalog-page';

export interface ListProductsInput {
  readonly accountId: string;
  readonly limit: number;
  readonly cursor?: CatalogCursor;
}

export interface ProductRepository {
  list(input: ListProductsInput): Promise<CatalogPage>;
}
