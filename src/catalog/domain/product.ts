import { Money } from './money';

export interface Product {
  readonly id: string;
  readonly name: string;
  readonly sku: string;
  readonly price: Money;
  readonly createdAt: Date;
}
