import { CustomDecorator, SetMetadata } from '@nestjs/common';

import { ThrottleRouteGroup } from '../domain/throttle-scope';

export const THROTTLE_GROUP_KEY = 'throttleGroup';

export const ThrottleGroup = (
  group: ThrottleRouteGroup,
): CustomDecorator<string> => SetMetadata(THROTTLE_GROUP_KEY, group);
