import { randomUUID } from 'node:crypto';

// The load balancer forwards X-Amzn-Trace-Id unchanged when a caller already
// supplies one, so an unauthenticated request could otherwise choose the id
// every log line is grouped by. Only a value matching this grammar is
// trusted; anything else falls back to a freshly generated id (FR28, AC-24).
const TRACE_HEADER_NAME = 'x-amzn-trace-id';
// Anchored end-to-end: a bare Root=<8hex>-<24hex> segment (optionally
// followed by well-formed ;key=value segments) must describe the WHOLE
// header, not just a substring of it — otherwise an attacker could wrap a
// single valid-looking Root value in arbitrary bytes and mint an unbounded
// number of distinct "conforming" ids (see resolveCorrelationId comment).
const TRACE_ROOT_PATTERN =
  /^Root=1-[0-9a-fA-F]{8}-[0-9a-fA-F]{24}(?:;[A-Za-z0-9_]+=[^;]*)*$/;

/**
 * Resolves the correlation id for a request from its inbound headers.
 *
 * @example
 * resolveCorrelationId({ 'X-Amzn-Trace-Id': 'Root=1-5e1b4151-5ac6c58f8bb828c1a5e8b3ff' });
 * // => 'Root=1-5e1b4151-5ac6c58f8bb828c1a5e8b3ff'
 */
export function resolveCorrelationId(headers: unknown): string {
  const traceHeader = readTraceHeader(headers);
  return traceHeader !== undefined && TRACE_ROOT_PATTERN.test(traceHeader)
    ? traceHeader
    : randomUUID();
}

function readTraceHeader(headers: unknown): string | undefined {
  const match = headerEntries(headers).find(
    ([name]) => name.toLowerCase() === TRACE_HEADER_NAME,
  );
  return typeof match?.[1] === 'string' ? match[1] : undefined;
}

function headerEntries(headers: unknown): [string, unknown][] {
  return typeof headers === 'object' && headers !== null
    ? Object.entries(headers as Record<string, unknown>)
    : [];
}
