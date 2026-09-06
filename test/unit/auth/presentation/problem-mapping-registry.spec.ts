/**
 * Task 2 (002-request-throttling): proves the shared `ProblemDetailsFilter`
 * actually aggregates `ProblemRow[]` contributions from more than one
 * bounded context under the same `PROBLEM_MAPPINGS` multi-provider token —
 * the entire reason the filter moved out of `auth` into `shared`. Two
 * independent row arrays (standing in for two sibling modules, e.g. `auth`
 * and `throttling`) are handed to the filter directly, and a row from the
 * *second* array must still match and map correctly.
 */
import type { ArgumentsHost } from '@nestjs/common';

import { ProblemDetailsFilter } from '../../../../src/shared/presentation/problem-details.filter';
import {
  row,
  ProblemRow,
} from '../../../../src/shared/presentation/problem-mapping';

class FirstModuleError extends Error {}
class SecondModuleError extends Error {}

interface CapturedProblemBody {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance: string;
  readonly code: string;
}

// Minimal stand-in for express's Response — only the three chained calls
// ProblemDetailsFilter.catch() makes, capturing what it was asked to send.
class FakeResponse {
  statusCode?: number;
  contentType?: string;
  body?: CapturedProblemBody;

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  type(contentType: string): this {
    this.contentType = contentType;
    return this;
  }

  json(body: CapturedProblemBody): this {
    this.body = body;
    return this;
  }
}

function buildHost(instance: string): {
  host: ArgumentsHost;
  response: FakeResponse;
} {
  const response = new FakeResponse();
  const request = { originalUrl: instance };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

describe('ProblemDetailsFilter multi-provider registry (Task 2)', () => {
  it('matches and maps a row contributed by the second registered array', () => {
    const firstModuleRows: readonly ProblemRow[] = [
      row(
        (e) => e instanceof FirstModuleError,
        409,
        'FIRST_MODULE_CODE',
        false,
      ),
    ];
    const secondModuleRows: readonly ProblemRow[] = [
      row(
        (e) => e instanceof SecondModuleError,
        429,
        'RATE_LIMIT_EXCEEDED',
        false,
      ),
    ];
    const filter = new ProblemDetailsFilter([
      firstModuleRows,
      secondModuleRows,
    ]);
    const { host, response } = buildHost('/throttling/probe');

    filter.catch(new SecondModuleError('too many requests'), host);

    expect(response.statusCode).toBe(429);
    expect(response.contentType).toBe('application/problem+json');
    expect(response.body?.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(response.body?.status).toBe(429);
    expect(response.body?.instance).toBe('/throttling/probe');
    expect(response.body?.type).toBe('about:blank');
  });

  it('falls back to the shared default mapping when no contributed row matches', () => {
    const firstModuleRows: readonly ProblemRow[] = [
      row(
        (e) => e instanceof FirstModuleError,
        409,
        'FIRST_MODULE_CODE',
        false,
      ),
    ];
    const filter = new ProblemDetailsFilter([firstModuleRows, []]);
    const { host, response } = buildHost('/auth/register');

    filter.catch(new Error('unmapped'), host);

    expect(response.statusCode).toBe(503);
    expect(response.body?.code).toBe('SERVICE_UNAVAILABLE');
  });
});
