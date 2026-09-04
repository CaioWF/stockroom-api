import { DescribeCaller } from '../../../../src/auth/application/describe-caller.usecase';

describe('DescribeCaller', () => {
  it('shapes the verified token claims into the GET /auth/me response (FR13, AC-8)', () => {
    const describeCaller = new DescribeCaller();

    const result = describeCaller.execute({
      accountId: '00000000-0000-7000-8000-000000000000',
      email: 'caller@example.com',
    });

    expect(result).toEqual({
      accountId: '00000000-0000-7000-8000-000000000000',
      email: 'caller@example.com',
    });
  });

  it('carries exactly the two fields the guarded route may return, nothing else (AC-8)', () => {
    const describeCaller = new DescribeCaller();

    const result = describeCaller.execute({
      accountId: 'some-account-id',
      email: 'someone@example.com',
    });

    expect(Object.keys(result)).toEqual(['accountId', 'email']);
  });
});
