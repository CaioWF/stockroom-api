/**
 * AC-12: `contract.md`'s own observable claims the public route list is
 * asserted to hold exactly six documented routes, but no test ever made
 * that assertion (`guard.e2e-spec.ts` deliberately checked only three,
 * per its own stale comment, from before jwks/health/openapi existed) —
 * this is that missing proof. Reflects `@Public()`'s metadata directly off
 * each controller's prototype rather than booting the app, since the
 * property under test is a compile-time decorator, not runtime behavior.
 */
import { IS_PUBLIC_KEY } from '../../../../src/auth/presentation/public.decorator';
import { AuthController } from '../../../../src/auth/presentation/auth.controller';
import { OpenApiController } from '../../../../src/auth/presentation/openapi.controller';
import { JwksController } from '../../../../src/auth/presentation/jwks.controller';
import { HealthController } from '../../../../src/health/health.controller';

const EXPECTED_PUBLIC_HANDLERS = [
  'AuthController.login',
  'AuthController.refresh',
  'AuthController.register',
  'HealthController.check',
  'JwksController.jwks',
  'OpenApiController.document',
];

interface ControllerSpec {
  readonly label: string;
  readonly prototype: Record<string, (...args: never[]) => unknown>;
  readonly methodNames: readonly string[];
}

const CONTROLLERS: readonly ControllerSpec[] = [
  {
    label: 'AuthController',
    prototype: AuthController.prototype as ControllerSpec['prototype'],
    methodNames: ['register', 'login', 'refresh', 'me'],
  },
  {
    label: 'OpenApiController',
    prototype: OpenApiController.prototype as ControllerSpec['prototype'],
    methodNames: ['document'],
  },
  {
    label: 'JwksController',
    prototype: JwksController.prototype as ControllerSpec['prototype'],
    methodNames: ['jwks'],
  },
  {
    label: 'HealthController',
    prototype: HealthController.prototype as ControllerSpec['prototype'],
    methodNames: ['check'],
  },
];

function isPublic(
  prototype: Record<string, (...args: never[]) => unknown>,
  methodName: string,
): boolean {
  return Reflect.getMetadata(IS_PUBLIC_KEY, prototype[methodName]) === true;
}

describe('Public route allowlist (AC-12)', () => {
  it('marks exactly the six documented routes @Public(), denying every other handler by default', () => {
    const publicHandlers = CONTROLLERS.flatMap((controller) =>
      controller.methodNames
        .filter((methodName) => isPublic(controller.prototype, methodName))
        .map((methodName) => `${controller.label}.${methodName}`),
    );

    expect(publicHandlers.sort()).toEqual(EXPECTED_PUBLIC_HANDLERS);
  });

  it('leaves AuthController.me off the allowlist, so JwtAuthGuard denies it by default', () => {
    expect(
      isPublic(AuthController.prototype as ControllerSpec['prototype'], 'me'),
    ).toBe(false);
  });
});
