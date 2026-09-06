export class InvalidMoneyError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export interface MoneyJson {
  readonly amount: number;
  readonly currency: string;
}

const CURRENCY_CODE = /^[A-Z]{3}$/;

export class Money {
  private constructor(
    readonly amount: number,
    readonly currency: string,
  ) {}

  static fromMinorUnits(amount: number, currency: string): Money {
    assertMinorUnits(amount);
    assertCurrencyCode(currency);
    return new Money(amount, currency);
  }

  toJSON(): MoneyJson {
    return { amount: this.amount, currency: this.currency };
  }
}

function assertMinorUnits(amount: number): void {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new InvalidMoneyError('amount must be a non-negative integer');
  }
}

function assertCurrencyCode(currency: string): void {
  if (!CURRENCY_CODE.test(currency)) {
    throw new InvalidMoneyError('currency must be an ISO-4217 code');
  }
}
