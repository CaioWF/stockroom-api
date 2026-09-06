import type { ArgumentsHost } from '@nestjs/common';

import { ProblemDetailsFilter } from '../../../../src/shared/presentation/problem-details.filter';
import { RateLimitExceededError } from '../../../../src/throttling/presentation/rate-limit-exceeded.error';
import { throttlingProblemMappings } from '../../../../src/throttling/presentation/throttling-problem-mappings';

interface CapturedProblemBody {
  readonly status: number;
  readonly code: string;
}

class FakeResponse {
  statusCode?: number;
  contentType?: string;
  body?: CapturedProblemBody;
  headers = new Map<string, string>();

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  type(contentType: string): this {
    this.contentType = contentType;
    return this;
  }

  setHeader(name: string, value: string): this {
    this.headers.set(name, value);
    return this;
  }

  json(body: CapturedProblemBody): this {
    this.body = body;
    return this;
  }
}

function buildHost(): { host: ArgumentsHost; response: FakeResponse } {
  const response = new FakeResponse();
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ originalUrl: '/auth/login' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

describe('RateLimitExceededError problem mapping', () => {
  it('renders a 429 problem document with Retry-After', () => {
    const filter = new ProblemDetailsFilter([throttlingProblemMappings]);
    const { host, response } = buildHost();

    filter.catch(new RateLimitExceededError(17), host);

    expect(response.statusCode).toBe(429);
    expect(response.contentType).toBe('application/problem+json');
    expect(response.headers.get('Retry-After')).toBe('17');
    expect(response.body).toEqual(
      expect.objectContaining({
        status: 429,
        code: 'RATE_LIMIT_EXCEEDED',
      }),
    );
  });
});
