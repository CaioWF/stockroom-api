/**
 * The RFC 9457 problem-document shape (FR24) as a zod schema, for the
 * generated OpenAPI document (AC-26). `code` reuses `PROBLEM_CODES` from
 * problem-details.filter.ts — the one place the closed set is defined — so
 * the values published here can never drift from what the filter actually
 * emits.
 */
import './extend-zod';

import { z } from 'zod';

import { PROBLEM_CODES } from '../../../shared/presentation/problem-details.filter';

export const ProblemDetailsSchema = z
  .object({
    type: z.string().openapi({ example: 'about:blank' }),
    title: z.string().openapi({ example: 'email already registered' }),
    status: z.number().openapi({ example: 409 }),
    detail: z.string(),
    instance: z.string().openapi({ example: '/auth/register' }),
    code: z.enum(PROBLEM_CODES),
  })
  .openapi('ProblemDetails');
