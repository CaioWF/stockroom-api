import { deriveClientAddressIdentity } from '../../../../src/throttling/presentation/client-address.policy';

describe('client address policy', () => {
  it('uses the right-most X-Forwarded-For entry and ignores forged client-supplied entries', () => {
    const first = deriveClientAddressIdentity({
      headers: {
        'x-forwarded-for': '198.51.100.111, 198.51.100.112, 203.0.113.9',
      },
    });
    const second = deriveClientAddressIdentity({
      headers: {
        'x-forwarded-for': '10.0.0.1, 192.0.2.77, 203.0.113.9',
      },
    });

    expect(first).toBe('203.0.113.9');
    expect(second).toBe('203.0.113.9');
  });

  it('collapses requests without X-Forwarded-For into one shared identity', () => {
    expect(deriveClientAddressIdentity({ headers: {} })).toBe(
      'missing-x-forwarded-for',
    );
  });

  it('folds IPv6 client addresses to their /64 prefix', () => {
    const first = deriveClientAddressIdentity({
      headers: { 'x-forwarded-for': '2001:db8:abcd:1234:1111:2222:3333:4444' },
    });
    const second = deriveClientAddressIdentity({
      headers: { 'x-forwarded-for': '2001:db8:abcd:1234:aaaa:bbbb:cccc:dddd' },
    });

    expect(first).toBe('2001:0db8:abcd:1234::/64');
    expect(second).toBe('2001:0db8:abcd:1234::/64');
  });
});
