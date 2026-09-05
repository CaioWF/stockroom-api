import { CustomDecorator, SetMetadata } from '@nestjs/common';

export const IS_THROTTLE_EXEMPT_KEY = 'isThrottleExempt';

export const NoThrottle = (): CustomDecorator<string> =>
  SetMetadata(IS_THROTTLE_EXEMPT_KEY, true);
