import './extend-zod';

import { z } from 'zod';

import { PROBLEM_CODES } from '../problem-details.filter';

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
