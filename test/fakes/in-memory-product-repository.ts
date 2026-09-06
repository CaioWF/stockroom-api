import { CatalogPage } from '../../src/catalog/domain/catalog-page';
import {
  ListProductsInput,
  ProductRepository,
} from '../../src/catalog/domain/ports/product-repository';

export class InMemoryProductRepository implements ProductRepository {
  readonly requests: ListProductsInput[] = [];

  constructor(private readonly page: CatalogPage) {}

  list(input: ListProductsInput): Promise<CatalogPage> {
    this.requests.push(input);
    return Promise.resolve(this.page);
  }
}
