import { GetParameterCommandOutput } from '@aws-sdk/client-ssm';

/**
 * Adapter-local test double for `SSMClient` (per Task 11's brief) — a plain
 * counter field observed as state, not a mock-framework spy, matching this
 * codebase's existing "fakes not mocks" pattern (e.g.
 * `InMemoryRefreshTokenRepository`'s own internal state checks). Typed only
 * as far as `.send()`'s one call shape requires, then cast to `SSMClient` at
 * the call site: the real client's base class carries a private field that
 * makes it otherwise structurally distinct from a plain object.
 */
export class FakeSsmClient {
  callCount = 0;

  constructor(private readonly parameterValue: string | undefined) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature must match SSMClient.send(command); the fake ignores which command was sent, only counting calls
  send(_command: unknown): Promise<GetParameterCommandOutput> {
    this.callCount += 1;
    return Promise.resolve({
      Parameter: { Value: this.parameterValue },
      $metadata: {},
    });
  }
}
