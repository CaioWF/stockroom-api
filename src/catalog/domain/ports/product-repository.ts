import { CatalogCursor } from '../catalog-cursor';
import { CatalogPage } from '../catalog-page';

export interface ListProductsInput {
  readonly limit: number;
  readonly cursor?: CatalogCursor;
}

export interface ProductRepository {
  list(input: ListProductsInput): Promise<CatalogPage>;
}
