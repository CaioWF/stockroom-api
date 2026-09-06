import 'reflect-metadata';

import { OpenApiController } from '../../../../src/auth/presentation/openapi.controller';
import { HealthController } from '../../../../src/health/health.controller';
import { IS_THROTTLE_EXEMPT_KEY } from '../../../../src/throttling/presentation/no-throttle.decorator';

const EXPECTED_EXEMPT_HANDLERS = [
  'HealthController.check',
  'OpenApiController.document',
];

interface ControllerSpec {
  readonly label: string;
  readonly prototype: Record<string, (...args: never[]) => unknown>;
  readonly methodNames: readonly string[];
}

const CONTROLLERS: readonly ControllerSpec[] = [
  {
    label: 'OpenApiController',
    prototype: OpenApiController.prototype as ControllerSpec['prototype'],
    methodNames: ['document'],
  },
  {
    label: 'HealthController',
    prototype: HealthController.prototype as ControllerSpec['prototype'],
    methodNames: ['check'],
  },
];

function isThrottleExempt(
  prototype: Record<string, (...args: never[]) => unknown>,
  methodName: string,
): boolean {
  return (
    Reflect.getMetadata(IS_THROTTLE_EXEMPT_KEY, prototype[methodName]) === true
  );
}

describe('throttle exemption allowlist', () => {
  it('marks exactly the documented routes @NoThrottle()', () => {
    const exemptHandlers = CONTROLLERS.flatMap((controller) =>
      controller.methodNames
        .filter((methodName) =>
          isThrottleExempt(controller.prototype, methodName),
        )
        .map((methodName) => `${controller.label}.${methodName}`),
    );

    expect(exemptHandlers.sort()).toEqual(EXPECTED_EXEMPT_HANDLERS);
  });
});
