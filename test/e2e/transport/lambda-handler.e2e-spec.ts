// MUST be the first import that reaches src/app.module.ts: ConfigurationModule
// parses process.env eagerly at module-evaluation time (see that file's own
// comment), so the environment has to be in place before src/lambda.ts is
// ever required below — same requirement build-test-app.ts documents for
// the other e2e specs, which this spec doesn't use (it exercises the real
// handler export via NestFactory.create, not a Nest testing module).
import '../auth/support/set-test-environment';

import type { ALBResult, Context } from 'aws-lambda';
import { albEventFixture } from '../../fixtures/alb-event.fixture';

// A stand-in Lambda context; the handler under test never reads it.
const fakeContext = {} as Context;

// require(), not import(), inside jest.isolateModules(): this project's Jest
// runs as CommonJS without --experimental-vm-modules, so a real dynamic
// import() throws there. Wrapped once so the eslint-disable directive isn't
// repeated (and isn't fragile to prettier reformatting the call site).
function requireLambdaModule(): typeof import('../../../src/lambda') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../../../src/lambda') as typeof import('../../../src/lambda');
}

function requireNestCore(): typeof import('@nestjs/core') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@nestjs/core') as typeof import('@nestjs/core');
}

describe('lambda transport handler', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('answers a well-formed 503 envelope when application initialization fails (AC-23)', async () => {
    // Force the lazy bootstrap to reject for exactly this invocation, via a
    // real spy on the real dependency (never a mock standing in for the
    // handler itself) — jest.isolateModules gives this block its own module
    // registry, so the forced failure and the spy do not leak into any other
    // test in this file (per test-driven-development: no test-only branch in
    // production code).
    let handler: (typeof import('../../../src/lambda'))['handler'] | undefined;
    jest.isolateModules(() => {
      const { NestFactory } = requireNestCore();
      jest
        .spyOn(NestFactory, 'create')
        .mockRejectedValueOnce(new Error('parameter store unreachable'));

      ({ handler } = requireLambdaModule());
    });

    const result = (await handler?.(
      albEventFixture,
      fakeContext,
      () => undefined,
    )) as ALBResult;

    expect(result.statusCode).toBe(503);
    expect(result.isBase64Encoded).toBe(false);
    expect(typeof result.body).toBe('string');
  });

  it('answers a well-formed envelope when application initialization succeeds', async () => {
    let handler: (typeof import('../../../src/lambda'))['handler'] | undefined;
    jest.isolateModules(() => {
      ({ handler } = requireLambdaModule());
    });

    const result = (await handler?.(
      albEventFixture,
      fakeContext,
      () => undefined,
    )) as ALBResult;

    expect(typeof result.statusCode).toBe('number');
    expect(typeof result.isBase64Encoded).toBe('boolean');
    expect(result.headers).toBeDefined();
  });

  it('bootstraps the application once and reuses it across warm invocations', async () => {
    let handler: (typeof import('../../../src/lambda'))['handler'] | undefined;
    let createSpy: jest.SpyInstance | undefined;
    jest.isolateModules(() => {
      const { NestFactory } = requireNestCore();
      createSpy = jest.spyOn(NestFactory, 'create');

      ({ handler } = requireLambdaModule());
    });

    await handler?.(albEventFixture, fakeContext, () => undefined);
    await handler?.(albEventFixture, fakeContext, () => undefined);

    expect(createSpy).toHaveBeenCalledTimes(1);
  });
});
