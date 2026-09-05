/** Which identity axis a throttle counter is keyed on (plan.md's scope decision). */
export type ThrottleScope = 'ip' | 'account';

/**
 * Which route's policy applies. `'default'` is the group an un-decorated
 * throttled route falls into (plan.md: "Route group by decorator, with a
 * default") — assigning a route to a group is a presentation-layer concern,
 * out of this domain's scope.
 */
export type ThrottleRouteGroup = 'credentials' | 'refresh' | 'jwks' | 'default';
