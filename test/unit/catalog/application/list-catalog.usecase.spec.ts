import { ListCatalog } from '../../../../src/catalog/application/list-catalog.usecase';
import {
  InvalidCursorError,
  InvalidPageLimitError,
} from '../../../../src/catalog/domain/errors';
import { encodeCatalogCursor } from '../../../../src/catalog/domain/catalog-cursor';
import { Money } from '../../../../src/catalog/domain/money';
import { Product } from '../../../../src/catalog/domain/product';
import { InMemoryProductRepository } from '../../../fakes/in-memory-product-repository';

const PRODUCT_ID = '018f2f3c-0000-7000-8000-000000000001';

function product(id = PRODUCT_ID): Product {
  return {
    id,
    name: 'Red mug',
    sku: 'MUG-RED',
    price: Money.fromMinorUnits(1299, 'USD'),
    createdAt: new Date('2026-09-05T12:00:00.000Z'),
  };
}

function useCaseWith(pageProduct = product()): {
  useCase: ListCatalog;
  repository: InMemoryProductRepository;
} {
  const repository = new InMemoryProductRepository({
    items: [pageProduct],
    nextCursor: { productId: PRODUCT_ID, sortKey: `PRODUCT#${PRODUCT_ID}` },
  });
  return { useCase: new ListCatalog(repository), repository };
}

describe('ListCatalog', () => {
  it.each([
    ['non-numeric', 'abc'],
    ['empty', ''],
    ['zero', '0'],
    ['negative', '-1'],
    ['fractional', '1.5'],
    ['above cap', '101'],
  ])('rejects a %s limit', async (_name, limit) => {
    const { useCase, repository } = useCaseWith();

    await expect(
      useCase.execute({ accountId: 'account-1', limit }),
    ).rejects.toBeInstanceOf(InvalidPageLimitError);
    expect(repository.requests).toHaveLength(0);
  });

  it('uses 25 as the default page limit', async () => {
    const { useCase, repository } = useCaseWith();

    await useCase.execute({ accountId: 'account-1' });

    expect(repository.requests[0]?.limit).toBe(25);
  });

  it('rejects an invalid cursor without reading the store', async () => {
    const { useCase, repository } = useCaseWith();

    await expect(
      useCase.execute({ accountId: 'account-1', cursor: 'not-a-cursor' }),
    ).rejects.toBeInstanceOf(InvalidCursorError);
    expect(repository.requests).toHaveLength(0);
  });

  it('rejects a repeated cursor as an invalid cursor', async () => {
    const { useCase, repository } = useCaseWith();

    await expect(
      useCase.execute({ accountId: 'account-1', cursor: ['first', 'second'] }),
    ).rejects.toBeInstanceOf(InvalidCursorError);
    expect(repository.requests).toHaveLength(0);
  });

  it('preserves a store marker even when the page is shorter than the limit', async () => {
    const { useCase } = useCaseWith();

    const result = await useCase.execute({
      accountId: 'account-1',
      limit: '5',
    });

    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBe(
      encodeCatalogCursor({ productId: PRODUCT_ID }),
    );
  });
});
