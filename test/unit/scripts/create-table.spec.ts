import {
  DescribeTimeToLiveCommand,
  DynamoDBClient,
  DynamoDBServiceException,
  ResourceInUseException,
  UpdateTimeToLiveCommand,
} from '@aws-sdk/client-dynamodb';
import { ensureTableExists } from '../../../scripts/create-table';

/**
 * `ensureTableExists` composes `createTableIfMissing` + `enableTtlIfNeeded`,
 * neither of which is exported on its own — exercising it through the public
 * function is what proves the branching logic inside `enableTtlIfNeeded`'s
 * catch block, not a call-count assertion on the mock.
 *
 * `DynamoDBServiceException` instances below are built the same way the
 * installed `@aws-sdk/client-dynamodb@3.1125.0` runtime builds them: this SDK
 * version does not export/generate a dedicated `ValidationException` class
 * (verified: no such export exists in the package's types or runtime, and
 * `UpdateTimeToLiveCommand`'s own `@throws` JSDoc list never names one) — a
 * concurrent "enable TTL" race deserializes into the generic
 * `DynamoDBServiceException` base class with `name: 'ValidationException'`
 * set from the response's error code. Confirmed empirically against local
 * DynamoDB: two concurrent `UpdateTimeToLiveCommand` calls against a
 * TTL-unset table reject the loser with exactly this shape and the message
 * "TimeToLive is already enabled".
 */
function buildValidationException(message: string): DynamoDBServiceException {
  return new DynamoDBServiceException({
    name: 'ValidationException',
    $fault: 'client',
    $metadata: {},
    message,
  });
}

function buildFakeClient(
  updateTtlBehavior: () => Promise<unknown>,
): DynamoDBClient {
  const send = jest.fn(async (command: unknown) => {
    if (command instanceof DescribeTimeToLiveCommand) {
      return { TimeToLiveDescription: { TimeToLiveStatus: 'DISABLED' } };
    }
    if (command instanceof UpdateTimeToLiveCommand) {
      return updateTtlBehavior();
    }
    return {};
  });
  return { send } as unknown as DynamoDBClient;
}

describe('ensureTableExists TTL race handling', () => {
  it('swallows the concurrent-enable ValidationException and completes', async () => {
    const client = buildFakeClient(() =>
      Promise.reject(buildValidationException('TimeToLive is already enabled')),
    );

    await expect(
      ensureTableExists(client, 'some-table'),
    ).resolves.toBeUndefined();
  });

  it('rethrows a ValidationException for an unrelated cause', async () => {
    const client = buildFakeClient(() =>
      Promise.reject(
        buildValidationException(
          'Names of key attributes and attributes projected into an index must be between 1 and 255 characters, inclusive',
        ),
      ),
    );

    await expect(ensureTableExists(client, 'some-table')).rejects.toThrow(
      'Names of key attributes',
    );
  });

  it('rethrows a non-ValidationException error from the TTL update', async () => {
    const client = buildFakeClient(() =>
      Promise.reject(
        new ResourceInUseException({
          message: 'unrelated conflict',
          $metadata: {},
        }),
      ),
    );

    await expect(
      ensureTableExists(client, 'some-table'),
    ).rejects.toBeInstanceOf(ResourceInUseException);
  });
});
