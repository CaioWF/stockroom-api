// Allow-list, not deny-list: only named fields are emitted, and a field added
// later is withheld by default instead of leaking silently (FR28, AC-25).
// Wire bodies in this project are camelCase, so the list is spelled that way.
const ALLOWED_LOG_FIELDS = [
  'level',
  'message',
  'correlationId',
  'route',
  'method',
  'statusCode',
  'code',
  'outcome',
  'event',
  'accountId',
  'durationMs',
  'context',
  'scope',
  'routeGroup',
  'retryAfterSeconds',
] as const;

export type LogSink = (line: string) => void;

const defaultSink: LogSink = (line) => process.stdout.write(`${line}\n`);

/** Emits one structured JSON line per call, redacted through the allow-list. */
export class StructuredLogger {
  constructor(private readonly sink: LogSink = defaultSink) {}

  log(fields: Readonly<Record<string, unknown>>): void {
    this.sink(JSON.stringify(redact(fields)));
  }
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  return isPlainObject(value) ? redactObject(value) : value;
}

function redactObject(value: Record<string, unknown>): Record<string, unknown> {
  const allowed: readonly string[] = ALLOWED_LOG_FIELDS;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => allowed.includes(key))
      .map(([key, nested]) => [key, redact(nested)]),
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
