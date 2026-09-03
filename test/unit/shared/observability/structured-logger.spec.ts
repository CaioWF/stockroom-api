import { StructuredLogger } from '../../../../src/shared/observability/structured-logger';

describe('StructuredLogger', () => {
  it('emits only allow-listed fields and withholds every credential, including one nested a level deep', () => {
    const lines: string[] = [];
    const logger = new StructuredLogger((line) => lines.push(line));

    logger.log({
      message: 'sign-in succeeded',
      correlationId: 'corr-fake-123',
      accountId: 'acc-fake-456',
      password: 'fake-plaintext-password',
      accessToken: 'fake-access-token-value',
      refreshToken: 'fake-refresh-token-value',
      authorization: 'Bearer fake-authorization-header',
      passwordHash: '$argon2id$fake-digest-value$',
      password_hash: 'fake-snake-case-digest',
      access_token: 'fake-snake-case-access-token',
      refresh_token: 'fake-snake-case-refresh-token',
      context: {
        accountId: 'nested-acc-fake-789',
        password: 'fake-nested-password',
      },
    });

    expect(lines).toHaveLength(1);
    const emitted = lines[0] ?? '';
    const parsed: unknown = JSON.parse(emitted);

    expect(parsed).toEqual({
      message: 'sign-in succeeded',
      correlationId: 'corr-fake-123',
      accountId: 'acc-fake-456',
      context: { accountId: 'nested-acc-fake-789' },
    });

    expect(emitted).not.toContain('fake-plaintext-password');
    expect(emitted).not.toContain('fake-access-token-value');
    expect(emitted).not.toContain('fake-refresh-token-value');
    expect(emitted).not.toContain('fake-authorization-header');
    expect(emitted).not.toContain('fake-digest-value');
    expect(emitted).not.toContain('fake-snake-case-digest');
    expect(emitted).not.toContain('fake-snake-case-access-token');
    expect(emitted).not.toContain('fake-snake-case-refresh-token');
    expect(emitted).not.toContain('fake-nested-password');
  });

  it('emits an empty object when every field is unrecognized, proving it filters rather than passes through', () => {
    const lines: string[] = [];
    const logger = new StructuredLogger((line) => lines.push(line));

    logger.log({ password: 'fake-secret', somethingUnexpected: 'fake-value' });

    expect(lines[0]).toBe('{}');
  });
});
