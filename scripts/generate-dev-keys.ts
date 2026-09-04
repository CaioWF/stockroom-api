/**
 * Generates the development-only RS256 key pair `Rs256AccessTokenSigner`
 * signs with locally (`.gitignore`'s `keys/` entry keeps the output out of
 * version control). Prints the RFC 7638 thumbprint alongside the file paths
 * so a developer can hand the exact `kid` and key material to a local
 * Parameter Store setup — Task 11/18's concern, not this script's.
 *
 * Not unit-tested: this is an operational script that touches the
 * filesystem and generates real key material rather than application
 * logic, per the task brief. Run once manually and confirm the two PEM
 * files and printed thumbprint.
 */

import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { calculateJwkThumbprint, exportJWK, importSPKI } from 'jose';

const KEYS_DIR = join(process.cwd(), 'keys');
const PRIVATE_KEY_PATH = join(KEYS_DIR, 'private.pem');
const PUBLIC_KEY_PATH = join(KEYS_DIR, 'public.pem');
const RSA_MODULUS_LENGTH = 2048;
const FORCE_FLAG = '--force';

function parseForceFlag(argv: readonly string[]): boolean {
  return argv.includes(FORCE_FLAG);
}

// Regenerating a key pair silently would desync whatever a developer
// already configured elsewhere (e.g. a locally running Parameter Store
// stand-in) with the old kid — refuse unless the caller opts in explicitly.
function refuseToOverwriteExistingKeys(force: boolean): void {
  const alreadyExists =
    existsSync(PRIVATE_KEY_PATH) || existsSync(PUBLIC_KEY_PATH);
  if (alreadyExists && !force) {
    // SPEC_DEVIATION: raw throw new Error, banned by the constitution —
    // this is a standalone CLI script's own guard, never reaches the HTTP
    // error taxonomy (same reasoning as environment.schema.ts's deviation).
    throw new Error(
      `${KEYS_DIR} already contains a key pair — pass ${FORCE_FLAG} to overwrite`,
    );
  }
}

function generateRsaKeyPairPem(): { privateKey: string; publicKey: string } {
  return generateKeyPairSync('rsa', {
    modulusLength: RSA_MODULUS_LENGTH,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
}

function writeKeyFiles(privateKey: string, publicKey: string): void {
  mkdirSync(KEYS_DIR, { recursive: true });
  writeFileSync(PRIVATE_KEY_PATH, privateKey, { mode: 0o600 });
  writeFileSync(PUBLIC_KEY_PATH, publicKey);
}

async function calculatePublicKeyThumbprint(
  publicKey: string,
): Promise<string> {
  const publicCryptoKey = await importSPKI(publicKey, 'RS256');
  return calculateJwkThumbprint(await exportJWK(publicCryptoKey));
}

async function main(): Promise<void> {
  refuseToOverwriteExistingKeys(parseForceFlag(process.argv.slice(2)));

  const { privateKey, publicKey } = generateRsaKeyPairPem();
  writeKeyFiles(privateKey, publicKey);
  const thumbprint = await calculatePublicKeyThumbprint(publicKey);

  console.log(`private key written to ${PRIVATE_KEY_PATH}`);
  console.log(`public key written to ${PUBLIC_KEY_PATH}`);
  console.log(`kid (RFC 7638 thumbprint): ${thumbprint}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
