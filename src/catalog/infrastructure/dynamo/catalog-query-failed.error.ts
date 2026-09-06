export class CatalogQueryFailedError extends Error {
  constructor(readonly causeName: string) {
    super('catalog query failed');
  }
}
