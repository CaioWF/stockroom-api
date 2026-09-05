import 'reflect-metadata';

import {
  IS_THROTTLE_EXEMPT_KEY,
  NoThrottle,
} from '../../../../src/throttling/presentation/no-throttle.decorator';
import {
  THROTTLE_GROUP_KEY,
  ThrottleGroup,
} from '../../../../src/throttling/presentation/throttle-group.decorator';

class DecoratedController {
  @NoThrottle()
  exempt(): void {
    return undefined;
  }

  @ThrottleGroup('credentials')
  credentials(): void {
    return undefined;
  }
}

function decoratedMethod(methodName: keyof DecoratedController): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(
    DecoratedController.prototype,
    methodName,
  );
  return descriptor?.value as () => void;
}

describe('throttle decorators', () => {
  it('marks an exemption under a metadata key independent from @Public()', () => {
    expect(
      Reflect.getMetadata(IS_THROTTLE_EXEMPT_KEY, decoratedMethod('exempt')),
    ).toBe(true);
    expect(IS_THROTTLE_EXEMPT_KEY).not.toBe('isPublic');
  });

  it('stores the route group on the handler metadata', () => {
    expect(
      Reflect.getMetadata(THROTTLE_GROUP_KEY, decoratedMethod('credentials')),
    ).toBe('credentials');
  });
});
