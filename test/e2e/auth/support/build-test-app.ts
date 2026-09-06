/**
 * Boots the real Nest application for e2e coverage, with only the two
 * Parameter-Store-backed key providers swapped for an in-memory throwaway
 * pair (test-key-providers.ts) — every other production wiring in
 * AuthModule runs unmodified against the local DynamoDB compose service,
 * which must already be running (docker-compose.yml).
 *
 * The `./set-test-environment` import MUST be first, before any import that
 * transitively reaches `../../../../src/app.module` — see that file's own
 * comment: `ConfigurationModule` parses `process.env` eagerly at
 * module-evaluation time, so the environment must already be in place
 * before `app.module.ts`'s import chain runs.
 */
import './set-test-environment';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { ensureTableExists } from '../../../../scripts/create-table';
import { AppModule } from '../../../../src/app.module';
import {
  SIGNING_KEY_PROVIDER,
  VERIFICATION_KEY_SET_PROVIDER,
} from '../../../../src/auth/auth.module';
import { APP_CONFIG } from '../../../../src/shared/config/configuration.module';
import {
  AppConfig,
  parseAppConfig,
} from '../../../../src/shared/config/environment.schema';
import { buildTestKeyMaterial, TestKeyMaterial } from './test-key-providers';

export interface TestApp {
  readonly app: INestApplication;
  readonly keyMaterial: TestKeyMaterial;
}

export interface TestAppOptions {
  readonly configOverrides?: Partial<AppConfig>;
  /**
   * A table of this file's own, created on demand. The catalog is one shared
   * partition (ADR-0007), so files that assert on exact catalog contents would
   * otherwise read each other's products across parallel jest workers.
   */
  readonly tableName?: string;
}

export async function buildTestApp(
  options: TestAppOptions = {},
): Promise<TestApp> {
  const tableName = options.tableName ?? requireEnv('TABLE_NAME');
  await ensureLocalTable(tableName);
  const keyMaterial = await buildTestKeyMaterial();

  const builder = Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(SIGNING_KEY_PROVIDER)
    .useValue(keyMaterial.signingKeyProvider)
    .overrideProvider(VERIFICATION_KEY_SET_PROVIDER)
    .useValue(keyMaterial.verificationKeySetProvider);

  if (
    options.configOverrides !== undefined ||
    options.tableName !== undefined
  ) {
    builder.overrideProvider(APP_CONFIG).useValue({
      ...parseAppConfig(process.env),
      tableName,
      ...options.configOverrides,
    });
  }

  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  return { app, keyMaterial };
}

// The app's own DynamoDB repositories assume the table already exists (per
// their own JSDoc) — `set-test-environment.ts` picks a fixed table name, so
// this idempotently creates it once per worker process before the app boots,
// the same bootstrap `test/integration/*.int-spec.ts` already relies on.
async function ensureLocalTable(tableName: string): Promise<void> {
  const client = new DynamoDBClient({
    region: requireEnv('AWS_REGION'),
    endpoint: requireEnv('DYNAMODB_ENDPOINT'),
  });
  await ensureTableExists(client, tableName);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(
      `${name} is not set — set-test-environment.ts must run first`,
    );
  }
  return value;
}
