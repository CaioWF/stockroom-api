import { HttpStatus } from '@nestjs/common';

import { InvalidCursorError, InvalidPageLimitError } from '../domain/errors';
import { CatalogQueryFailedError } from '../infrastructure/dynamo/catalog-query-failed.error';
import { MalformedProductItemError } from '../infrastructure/dynamo/malformed-product-item.error';
import { ProblemCode } from '../../shared/presentation/problem-details.filter';
import { row, ProblemRow } from '../../shared/presentation/problem-mapping';

export const catalogProblemMappings: readonly ProblemRow[] = [
  row(
    (e) => e instanceof InvalidCursorError,
    HttpStatus.UNPROCESSABLE_ENTITY,
    'INVALID_CURSOR' satisfies ProblemCode,
    true,
  ),
  row(
    (e) => e instanceof InvalidPageLimitError,
    HttpStatus.UNPROCESSABLE_ENTITY,
    'INVALID_PAGE_LIMIT' satisfies ProblemCode,
    true,
  ),
  row(
    (e) =>
      e instanceof CatalogQueryFailedError ||
      e instanceof MalformedProductItemError,
    HttpStatus.SERVICE_UNAVAILABLE,
    'SERVICE_UNAVAILABLE' satisfies ProblemCode,
    false,
  ),
];
