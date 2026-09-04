/**
 * Bridges two typing gaps every e2e spec in this suite would otherwise hit
 * individually: Nest's `INestApplication.getHttpServer()` is typed `any`,
 * and `supertest`'s `Response.body` is typed `any` too — both trip the
 * project's `no-unsafe-*` lint rules on every property access. `httpServerOf`
 * narrows the server once; the response-body interfaces below let each spec
 * cast `response.body` to the shape its own route actually returns instead
 * of touching `any` directly.
 */

import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';

export function httpServerOf(app: INestApplication): Server {
  return app.getHttpServer() as Server;
}

/** RFC 9457 body every rejected request answers with (FR24, AC-27). */
export interface ProblemBody {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance: string;
  readonly code: string;
}

export interface RegisterBody {
  readonly accountId: string;
  readonly email: string;
}

/** The shared shape `POST /auth/login` and a successful `POST /auth/refresh` both answer with. */
export interface TokenPairBody {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
  readonly refreshExpiresIn: number;
}

export interface MeBody {
  readonly accountId: string;
  readonly email: string;
}
