import { NestFactory } from '@nestjs/core';
import serverlessExpress from '@codegenie/serverless-express';
import type { ALBEvent, ALBResult, Handler } from 'aws-lambda';
import type { RequestListener } from 'http';
import { AppModule } from './app.module';
import { StructuredLogger } from './shared/observability/structured-logger';

// Nothing but pure module loading below this point. The application is a
// promise created lazily, on first invocation, inside the exported handler —
// never here at module scope. A cold start that ran NestFactory.create() here
// would throw during Lambda's module-init phase, which the platform turns
// into an opaque error rather than the well-formed 503 AC-23 requires
// (plan.md, "Two entry points, one application").
type LambdaHandler = Handler<ALBEvent, ALBResult>;

let appPromise: Promise<LambdaHandler> | undefined;
const logger = new StructuredLogger();

async function bootstrapLambdaHandler(): Promise<LambdaHandler> {
  const app = await NestFactory.create(AppModule);
  // Standalone (non-listening) Nest apps must be initialized explicitly —
  // app.listen() would normally do this, but a Lambda handler never listens.
  await app.init();
  // getInstance() is declared `(): any` on Nest's HttpServer interface; the
  // platform-express adapter's actual runtime value is the Express app,
  // which is a RequestListener — the one shape serverlessExpress accepts.
  const expressApp = app.getHttpAdapter().getInstance() as RequestListener;
  return serverlessExpress({ app: expressApp });
}

function unavailableEnvelope(): ALBResult {
  return {
    statusCode: 503,
    headers: { 'content-type': 'application/json' },
    isBase64Encoded: false,
    body: JSON.stringify({
      error: 'service_unavailable',
      message: 'the application failed to initialize',
    }),
  };
}

export const handler: LambdaHandler = async (event, context, callback) => {
  // Memoized so a warm invocation reuses the same application instead of
  // rebuilding it; assigned before awaiting so concurrent warm invocations
  // share the one in-flight bootstrap rather than racing separate ones.
  appPromise ??= bootstrapLambdaHandler();

  try {
    const forwardToApplication = await appPromise;
    // The cast is load-bearing: Handler's return type is `void | Promise<T>`,
    // so `await`-ing it types as `ALBResult | void`, which tsc rejects as
    // this function's return value without narrowing void away explicitly.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    return (await forwardToApplication(event, context, callback)) as ALBResult;
  } catch (error) {
    // A failed bootstrap must not poison the warm container forever — clear
    // the memoized promise so the next invocation gets a fresh attempt.
    appPromise = undefined;
    logger.log({
      level: 'error',
      event: 'initialization_failure',
      message:
        error instanceof Error
          ? error.message
          : 'unknown initialization failure',
    });
    return unavailableEnvelope();
  }
};
