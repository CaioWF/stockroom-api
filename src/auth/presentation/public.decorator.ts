/**
 * Marks a route (or a whole controller) exempt from `JwtAuthGuard`'s
 * default-deny (FR11). The guard checks this metadata first — see
 * jwt-auth.guard.ts — so a route with no `@Public()` is denied by default,
 * never the other way around.
 */

import { CustomDecorator, SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

export const Public = (): CustomDecorator<string> =>
  SetMetadata(IS_PUBLIC_KEY, true);
