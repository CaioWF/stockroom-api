import { randomBytes } from 'node:crypto';

import { Money } from '../src/catalog/domain/money';
import { Product } from '../src/catalog/domain/product';
import { writeCatalogSeedProducts } from '../src/catalog/infrastructure/dynamo/catalog-seeder';

export interface SeedIdGenerator {
  readonly newId: () => string;
}

export class SeedCatalogInputError extends Error {}

const TIMESTAMP_BYTE_LENGTH = 6;
const VERSION_NIBBLE = 0x70;
const VERSION_OCTET_INDEX = 6;
const VARIANT_BITS = 0x80;
const VARIANT_MASK = 0x3f;
const VARIANT_OCTET_INDEX = 8;

export function createSeedIdGenerator(): SeedIdGenerator {
  return { newId: () => newUuidV7() };
}

export function buildCatalogSeedProducts(
  count: number,
  idGenerator: SeedIdGenerator = createSeedIdGenerator(),
): readonly Product[] {
  const validCount = parseSeedCount(count);
  return Array.from({ length: validCount }, (_value, index) =>
    buildProduct(index, idGenerator.newId()),
  );
}

async function seedCatalog(
  accountId: string,
  count: number,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const tableName = requireEnv(env, 'TABLE_NAME');
  await writeCatalogSeedProducts(
    tableName,
    accountId,
    buildCatalogSeedProducts(count),
    env,
  );
}

function buildProduct(index: number, id: string): Product {
  return {
    id,
    name: `Seed product ${index + 1}`,
    sku: `SEED-${String(index + 1).padStart(4, '0')}`,
    price: Money.fromMinorUnits(1000 + index, 'USD'),
    createdAt: new Date(),
  };
}

function newUuidV7(): string {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(Date.now(), 0, TIMESTAMP_BYTE_LENGTH);
  setVersionAndVariant(bytes);
  return formatUuid(bytes);
}

function setVersionAndVariant(bytes: Buffer): void {
  bytes.writeUInt8(
    (bytes.readUInt8(VERSION_OCTET_INDEX) & 0x0f) | VERSION_NIBBLE,
    VERSION_OCTET_INDEX,
  );
  bytes.writeUInt8(
    (bytes.readUInt8(VARIANT_OCTET_INDEX) & VARIANT_MASK) | VARIANT_BITS,
    VARIANT_OCTET_INDEX,
  );
}

function formatUuid(bytes: Buffer): string {
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (value === undefined || value.trim() === '') {
    throw new SeedCatalogInputError(`${name} environment variable is required`);
  }
  return value;
}

async function main(): Promise<void> {
  const [accountId, countText = '25'] = process.argv.slice(2);
  if (accountId === undefined || accountId.trim() === '') {
    throw new SeedCatalogInputError(
      'usage: ts-node scripts/seed-catalog.ts <accountId> [count]',
    );
  }
  const count = Number(countText);
  await seedCatalog(accountId, count, process.env);
  console.log(`seeded ${count} catalog products for ${accountId}`);
}

function parseSeedCount(count: number): number {
  if (!Number.isInteger(count) || count < 1) {
    throw new SeedCatalogInputError('count must be a positive integer');
  }
  return count;
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
