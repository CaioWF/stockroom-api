import { randomUUID } from 'node:crypto';

export function uniqueAddress(): string {
  const hex = randomUUID().replace(/-/g, '');
  return `10.${parseInt(hex.slice(0, 2), 16)}.${parseInt(
    hex.slice(2, 4),
    16,
  )}.${parseInt(hex.slice(4, 6), 16)}`;
}
