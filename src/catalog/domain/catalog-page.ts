import { CatalogCursor } from './catalog-cursor';
import { Product } from './product';

export interface CatalogPage {
  readonly items: readonly Product[];
  readonly nextCursor: CatalogCursor | null;
}
