/**
 * UUIDv7 minting (FR10, RFC 9562): 48 bits of big-endian Unix milliseconds
 * in octets 0-5, the version nibble fixed in octet 6, the variant bits fixed
 * in octet 8, everything else `crypto.randomBytes` output.
 *
 * Reads `Date.now()` directly rather than the injected `Clock` port — the
 * one deliberate exception in this feature (see `IdGenerator`'s own port
 * JSDoc): RFC 9562's whole point is real wall-clock ordering of generated
 * ids, and a frozen `ControllableClock` would make every id minted in a
 * test collide on the same millisecond instead of exercising real
 * distinctness.
 *
 * Buffer's `writeUIntBE`/`writeUInt8`/`readUInt8` accessors are used instead
 * of index assignment so `noUncheckedIndexedAccess` never has to reason
 * about a typed array's index signature.
 */

import { randomBytes } from 'node:crypto';

import { IdGenerator } from '../../domain/ports/id-generator';

const TIMESTAMP_BYTE_LENGTH = 6;
const VERSION_NIBBLE = 0x70; // 0111 in the high nibble of octet 6
const VERSION_OCTET_INDEX = 6;
const VARIANT_BITS = 0x80; // 10 in the top two bits of octet 8
const VARIANT_MASK = 0x3f;
const VARIANT_OCTET_INDEX = 8;

export class UuidV7Generator implements IdGenerator {
  newId(): string {
    const bytes = randomBytes(16);
    bytes.writeUIntBE(Date.now(), 0, TIMESTAMP_BYTE_LENGTH);
    this.setVersionAndVariant(bytes);
    return this.format(bytes);
  }

  private setVersionAndVariant(bytes: Buffer): void {
    const versionOctet = bytes.readUInt8(VERSION_OCTET_INDEX);
    bytes.writeUInt8(
      (versionOctet & 0x0f) | VERSION_NIBBLE,
      VERSION_OCTET_INDEX,
    );

    const variantOctet = bytes.readUInt8(VARIANT_OCTET_INDEX);
    bytes.writeUInt8(
      (variantOctet & VARIANT_MASK) | VARIANT_BITS,
      VARIANT_OCTET_INDEX,
    );
  }

  private format(bytes: Buffer): string {
    const hex = bytes.toString('hex');
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20, 32),
    ].join('-');
  }
}
