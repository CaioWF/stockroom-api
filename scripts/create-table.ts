/**
 * Idempotent local-table bootstrap (Task 12's own subtask requirement).
 * `PAY_PER_REQUEST` billing needs no capacity arguments to keep in sync on a
 * re-run, which is what makes idempotency simple here — the only two calls
 * that need their own idempotency handling are `CreateTableCommand` and
 * `UpdateTimeToLiveCommand`, confirmed against the installed
 * `@aws-sdk/client-dynamodb@3.1125.0` types/docs rather than from memory:
 *
 * - `CreateTableCommand` throws `ResourceInUseException` when "you attempted
 *   to recreate an existing table" (the command's own `@throws` JSDoc) — a
 *   plain catch-and-ignore is correct and sufficient.
 * - `UpdateTimeToLiveCommand` is NOT safe to blindly re-issue: its own JSDoc
 *   states "Any additional UpdateTimeToLive calls for the same table during
 *   this one hour duration result in a ValidationException." So this module
 *   calls `DescribeTimeToLiveCommand` first and only issues the update when
 *   TTL is not already `ENABLED` on the `ttl` attribute. That check-then-act
 *   is itself a race under concurrent callers (e.g. parallel Jest workers
 *   each calling `ensureTableExists` on startup): two callers can both see
 *   TTL as not-yet-enabled before either's `UpdateTimeToLiveCommand` lands,
 *   and the loser's call then hits the "one call per hour" restriction quoted
 *   above. `enableTtlIfNeeded` below catches exactly that loser case.
 *
 *   Despite the JSDoc prose naming "ValidationException", this SDK version
 *   does not export or generate a dedicated `ValidationException` class —
 *   confirmed by grepping this package's own `dist-types`/`dist-cjs` for the
 *   name (no hits) and by `UpdateTimeToLiveCommand`'s own `@throws` list,
 *   which names `InternalServerError`, `InvalidEndpointException`,
 *   `LimitExceededException`, `ResourceInUseException`,
 *   `ResourceNotFoundException`, and `DynamoDBServiceException`, but never
 *   `ValidationException`. Reproduced against local DynamoDB (two concurrent
 *   `UpdateTimeToLiveCommand` calls on a TTL-unset table): the loser's
 *   rejection is a generic `DynamoDBServiceException` instance with
 *   `name === 'ValidationException'` set from the response's error code, and
 *   `message === 'TimeToLive is already enabled'`. `ValidationException` is
 *   DynamoDB's general-purpose validation error code — reproduced separately
 *   with a malformed TTL attribute name, which comes back with the same
 *   `name` but an unrelated message — so `enableTtlIfNeeded` narrows the
 *   catch to that specific message rather than the exception name alone, to
 *   avoid silently swallowing a genuine config bug.
 *
 * This is the LOCAL/dev bootstrap only — the production Terraform table
 * definition is `specs/004-cloud-infrastructure`'s separate obligation.
 */

// The deployed table is ALSO declared in `terraform/data.tf`, and nothing
// mechanically keeps the two in sync — `npm run infra:check` only plans the
// Terraform, it never diffs it against this file. Changing a key, a type or
// the TTL attribute here means changing it there too, or local and deployed
// environments silently disagree. One deliberate difference: the Terraform
// table enables point-in-time recovery and this script does not, since local
// and CI tables are disposable.

import {
  CreateTableCommand,
  DescribeTimeToLiveCommand,
  DynamoDBClient,
  DynamoDBServiceException,
  ResourceInUseException,
  UpdateTimeToLiveCommand,
} from '@aws-sdk/client-dynamodb';

const PARTITION_KEY_ATTRIBUTE = 'PK';
const SORT_KEY_ATTRIBUTE = 'SK';
const TTL_ATTRIBUTE = 'ttl';

// Substring of the message DynamoDB returns (verified against local
// DynamoDB, see header comment) when a concurrent caller already enabled TTL
// first. Narrower than matching on `name === 'ValidationException'` alone,
// which DynamoDB also uses for unrelated validation failures.
const TTL_ALREADY_ENABLED_MESSAGE_FRAGMENT = 'already enabled';

function isConcurrentTtlEnableRace(error: unknown): boolean {
  return (
    error instanceof DynamoDBServiceException &&
    error.name === 'ValidationException' &&
    error.message.includes(TTL_ALREADY_ENABLED_MESSAGE_FRAGMENT)
  );
}

async function createTableIfMissing(
  client: DynamoDBClient,
  tableName: string,
): Promise<void> {
  try {
    await client.send(
      new CreateTableCommand({
        TableName: tableName,
        BillingMode: 'PAY_PER_REQUEST',
        AttributeDefinitions: [
          { AttributeName: PARTITION_KEY_ATTRIBUTE, AttributeType: 'S' },
          { AttributeName: SORT_KEY_ATTRIBUTE, AttributeType: 'S' },
        ],
        KeySchema: [
          { AttributeName: PARTITION_KEY_ATTRIBUTE, KeyType: 'HASH' },
          { AttributeName: SORT_KEY_ATTRIBUTE, KeyType: 'RANGE' },
        ],
      }),
    );
  } catch (error: unknown) {
    if (!(error instanceof ResourceInUseException)) {
      throw error;
    }
  }
}

async function isTtlAlreadyEnabled(
  client: DynamoDBClient,
  tableName: string,
): Promise<boolean> {
  const description = await client.send(
    new DescribeTimeToLiveCommand({ TableName: tableName }),
  );
  const ttl = description.TimeToLiveDescription;
  return (
    ttl?.TimeToLiveStatus === 'ENABLED' && ttl.AttributeName === TTL_ATTRIBUTE
  );
}

async function enableTtlIfNeeded(
  client: DynamoDBClient,
  tableName: string,
): Promise<void> {
  if (await isTtlAlreadyEnabled(client, tableName)) {
    return;
  }
  try {
    await client.send(
      new UpdateTimeToLiveCommand({
        TableName: tableName,
        TimeToLiveSpecification: {
          AttributeName: TTL_ATTRIBUTE,
          Enabled: true,
        },
      }),
    );
  } catch (error: unknown) {
    if (!isConcurrentTtlEnableRace(error)) {
      throw error;
    }
  }
}

/**
 * Creates the shared table (if it doesn't already exist) and enables TTL on
 * it (if not already enabled) — safe to call repeatedly. Exported so the
 * integration suite can call it directly in `beforeAll` instead of
 * shelling out to this file's CLI entry point as a subprocess.
 */
export async function ensureTableExists(
  client: DynamoDBClient,
  tableName: string,
): Promise<void> {
  await createTableIfMissing(client, tableName);
  await enableTtlIfNeeded(client, tableName);
}

function buildClientFromEnvironment(): DynamoDBClient {
  const endpoint = process.env.DYNAMODB_ENDPOINT;
  return new DynamoDBClient({
    region: process.env.AWS_REGION ?? 'us-east-1',
    ...(endpoint ? { endpoint } : {}),
  });
}

async function main(): Promise<void> {
  const tableName = process.env.TABLE_NAME;
  if (tableName === undefined || tableName.trim() === '') {
    // SPEC_DEVIATION: raw throw new Error, banned by the constitution —
    // this is a standalone CLI script's own argument validation, never
    // reaches the HTTP error taxonomy (out of problem-details.filter.ts's
    // scope, same reasoning as environment.schema.ts's own deviation).
    throw new Error('TABLE_NAME environment variable is required');
  }
  await ensureTableExists(buildClientFromEnvironment(), tableName);
  console.log(`table ${tableName} is ready (created + TTL enabled)`);
}

// Runs only when this file is the CLI entry point (`npm run db:create-table`),
// never when the integration suite imports `ensureTableExists` from it.
if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
