import { resolveCorrelationId } from '../../../../src/shared/observability/correlation-id';

const CONFORMING_HEADER =
  'Root=1-5e1b4151-5ac6c58f8bb828c1a5e8b3ff;Parent=53995c3f42cd8ad8;Sampled=1';
const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('resolveCorrelationId', () => {
  it('preserves a conforming trace header verbatim', () => {
    expect(resolveCorrelationId({ 'X-Amzn-Trace-Id': CONFORMING_HEADER })).toBe(
      CONFORMING_HEADER,
    );
  });

  it('reads the header name case-insensitively', () => {
    const header = 'Root=1-5e1b4151-5ac6c58f8bb828c1a5e8b3ff';
    expect(resolveCorrelationId({ 'x-amzn-trace-id': header })).toBe(header);
  });

  it.each([
    ['missing Root field', 'Parent=53995c3f42cd8ad8;Sampled=1'],
    ['short first hex segment', 'Root=1-5e1b41-5ac6c58f8bb828c1a5e8b3ff'],
    ['short second hex segment', 'Root=1-5e1b4151-5ac6c58f8bb828c1a5e8b3'],
    ['non-hex characters', 'Root=1-5e1b41zz-5ac6c58f8bb828c1a5e8b3ff'],
    ['empty string', ''],
    [
      'trailing content after a conforming Root segment',
      'Root=1-5e1b4151-5ac6c58f8bb828c1a5e8b3ff;not a valid key value pair',
    ],
    [
      'leading content before a conforming Root segment',
      'attacker-controlled-prefix;Root=1-5e1b4151-5ac6c58f8bb828c1a5e8b3ff',
    ],
  ])(
    'generates a fresh id and drops the supplied value when %s',
    (_label, header) => {
      const generated = resolveCorrelationId({ 'X-Amzn-Trace-Id': header });

      expect(generated).toMatch(UUID_SHAPE);
      expect(generated).not.toBe(header);
    },
  );

  it('generates a fresh id when the header is absent entirely', () => {
    expect(resolveCorrelationId({})).toMatch(UUID_SHAPE);
  });
});
