import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

import {
  httpServerOf,
  RegisterBody,
  TokenPairBody,
} from '../../auth/support/http-test-client';
import { uniqueAddress } from '../../throttling/support/unique-address';

const VALID_PASSWORD = 'correct horse battery';

export interface TestAccount extends TokenPairBody {
  readonly accountId: string;
}

export async function authenticateTestAccount(
  app: INestApplication,
  prefix: string,
): Promise<TestAccount> {
  const email = `${prefix}-${randomUUID()}@example.com`;
  const clientAddress = uniqueAddress();
  const registration = await request(httpServerOf(app))
    .post('/auth/register')
    .set('X-Forwarded-For', clientAddress)
    .send({ email, password: VALID_PASSWORD })
    .expect(201);
  const registered = registration.body as RegisterBody;
  const login = await request(httpServerOf(app))
    .post('/auth/login')
    .set('X-Forwarded-For', clientAddress)
    .send({ email, password: VALID_PASSWORD })
    .expect(200);
  return { ...(login.body as TokenPairBody), accountId: registered.accountId };
}
