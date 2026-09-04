import { PassThroughAccessTokenSigner } from '../../fakes/pass-through-access-token-signer';
import { EmailAddress } from '../../../src/auth/domain/email-address';

describe('PassThroughAccessTokenSigner', () => {
  it('encodes the claims into a stable, inspectable string', async () => {
    const signer = new PassThroughAccessTokenSigner();
    const claims = {
      accountId: '018f1c9a-1234-7abc-89ab-0123456789ab',
      email: EmailAddress.parse('merchant@example.com'),
    };

    const token = await signer.sign(claims);

    expect(token).toContain('018f1c9a-1234-7abc-89ab-0123456789ab');
    expect(token).toContain('merchant@example.com');
  });

  it('signs the same claims to the same string, deterministically', async () => {
    const signer = new PassThroughAccessTokenSigner();
    const claims = {
      accountId: '018f1c9a-1234-7abc-89ab-0123456789ab',
      email: EmailAddress.parse('merchant@example.com'),
    };

    const first = await signer.sign(claims);
    const second = await signer.sign(claims);

    expect(first).toBe(second);
  });

  it('signs different claims to different strings', async () => {
    const signer = new PassThroughAccessTokenSigner();

    const tokenA = await signer.sign({
      accountId: '018f1c9a-1234-7abc-89ab-0123456789ab',
      email: EmailAddress.parse('merchant@example.com'),
    });
    const tokenB = await signer.sign({
      accountId: '018f1c9a-5678-7def-9abc-fedcba987654',
      email: EmailAddress.parse('other@example.com'),
    });

    expect(tokenA).not.toBe(tokenB);
  });
});
