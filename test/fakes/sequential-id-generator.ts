/**
 * A deterministic `IdGenerator` (FR10). Mints UUIDv7-*shaped* strings (the
 * exact shape `RefreshTokenCredential.parse`'s `UUID_V7_PATTERN` validates
 * downstream — version nibble '7', variant nibble in 8-b) with a fixed
 * prefix and an incrementing counter in the trailing 12 hex digits, so a
 * test can assert on distinctness and ordering without real randomness.
 */

import { IdGenerator } from '../../src/auth/domain/ports/id-generator';

export class SequentialIdGenerator implements IdGenerator {
  private counter = 0;

  newId(): string {
    // 12 hex digits gives room for 16^12 sequential ids — far beyond any
    // single test run — before the counter's own hex representation would
    // no longer fit and padStart would silently stop zero-padding.
    const sequence = (this.counter++).toString(16).padStart(12, '0');
    return `00000000-0000-7000-8000-${sequence}`;
  }
}
