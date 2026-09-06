import { InvalidMoneyError, Money } from '../../../../src/catalog/domain/money';

describe('Money', () => {
  it('serializes an integer minor-unit amount with a currency code', () => {
    const money = Money.fromMinorUnits(1299, 'USD');

    expect(money.toJSON()).toEqual({ amount: 1299, currency: 'USD' });
  });

  it.each([
    ['negative', -1],
    ['fractional', 12.5],
  ])('rejects a %s amount', (_name, amount) => {
    expect(() => Money.fromMinorUnits(amount, 'USD')).toThrow(
      InvalidMoneyError,
    );
  });
});
