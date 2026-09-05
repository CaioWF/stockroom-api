import { HttpStatus } from '@nestjs/common';

import { ProblemCode } from '../../shared/presentation/problem-details.filter';
import { row, ProblemRow } from '../../shared/presentation/problem-mapping';
import { RateLimitExceededError } from './rate-limit-exceeded.error';

export const throttlingProblemMappings: readonly ProblemRow[] = [
  row(
    (e) => e instanceof RateLimitExceededError,
    HttpStatus.TOO_MANY_REQUESTS,
    'RATE_LIMIT_EXCEEDED' satisfies ProblemCode,
    false,
    (e): Readonly<Record<string, string>> => {
      if (!(e instanceof RateLimitExceededError)) {
        return {};
      }
      return { 'Retry-After': String(e.retryAfterSeconds) };
    },
  ),
];
