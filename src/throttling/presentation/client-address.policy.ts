import { isIP } from 'node:net';
import type { IncomingHttpHeaders } from 'node:http';

export const MISSING_X_FORWARDED_FOR_IDENTITY = 'missing-x-forwarded-for';

interface HeaderCarrier {
  readonly headers: IncomingHttpHeaders;
}

// SPEC_DEVIATION FR5a: plan.md records why no shared bootstrap step exists:
// derivation is a pure header function, with no `req.ip` or `trust proxy`
// setting for main.ts, lambda.ts, or the e2e builder to diverge on.
export function deriveClientAddressIdentity(request: HeaderCarrier): string {
  const candidate = rightMostForwardedForEntry(request.headers);
  if (candidate === undefined) {
    return MISSING_X_FORWARDED_FOR_IDENTITY;
  }
  return foldIpv6Prefix(candidate);
}

function rightMostForwardedForEntry(
  headers: IncomingHttpHeaders,
): string | undefined {
  const value = headers['x-forwarded-for'];
  const header = Array.isArray(value) ? value.at(-1) : value;
  if (header === undefined) {
    return undefined;
  }
  return lastNonEmptyPart(header);
}

function lastNonEmptyPart(header: string): string | undefined {
  return header
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .at(-1);
}

function foldIpv6Prefix(address: string): string {
  if (isIP(address) !== 6) {
    return address;
  }
  return `${expandIpv6(address).slice(0, 4).join(':')}::/64`;
}

function expandIpv6(address: string): readonly string[] {
  const [left = '', right = ''] = address.toLowerCase().split('::');
  const leftParts = partsOf(left);
  const rightParts = partsOf(right);
  const missing = 8 - leftParts.length - rightParts.length;
  const zeroes = Array.from({ length: missing }, () => '0000');
  return [...leftParts, ...zeroes, ...rightParts];
}

function partsOf(part: string): readonly string[] {
  if (part.length === 0) {
    return [];
  }
  return part.split(':').map((group) => group.padStart(4, '0'));
}
