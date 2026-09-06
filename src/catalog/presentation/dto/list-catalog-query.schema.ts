export interface ListCatalogQuery {
  readonly limit?: unknown;
  readonly cursor?: unknown;
}

export function parseListCatalogQuery(query: unknown): ListCatalogQuery {
  if (!isRecord(query)) {
    return {};
  }
  return { limit: query.limit, cursor: query.cursor };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
