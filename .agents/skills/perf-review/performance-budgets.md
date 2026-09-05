# Performance budgets & tactics — perf-review companion

Concrete numeric targets and remediation tactics the `perf-review` lens consults when a
finding needs a threshold or a fix suggestion. The lens itself makes the *judgment* (is
this path actually hot? does the abstraction earn its cost?); this file supplies the
*numbers* and *tactics* that judgment cites — it does not replace profiler/bundler gates.

Adapted from [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills)
`references/performance-checklist.md` (MIT, © 2025 Addy Osmani).

## Core Web Vitals — pass/needs-work/poor

| Metric | Good | Needs work | Poor |
|---|---|---|---|
| LCP (Largest Contentful Paint) | ≤ 2.5s | ≤ 4.0s | > 4.0s |
| INP (Interaction to Next Paint) | ≤ 200ms | ≤ 500ms | > 500ms |
| CLS (Cumulative Layout Shift) | ≤ 0.1 | ≤ 0.25 | > 0.25 |

## JavaScript / bundle
- Initial bundle < 200KB gzipped on a critical path.
- Code-split with dynamic imports; keep heavy modules off the critical path.
- Tree-shake — verify dependencies export ESM.
- `defer`/`async` scripts; never block in `<head>`.
- Break long tasks (> 50ms) with `scheduler.yield()` / yield-to-main.
- Defer non-critical work (analytics, logging) out of event handlers.
- Front heavy third-party scripts with facades.

## Images
- WebP/AVIF; `srcset` + `sizes`; explicit `width`/`height` (prevents CLS).
- `loading="lazy"` + `decoding="async"` below the fold; `fetchpriority="high"` on the LCP image.

## Fonts
- 2–3 families max, WOFF2 only, self-host when possible.
- Preload the LCP-critical font; `font-display: swap`; subset with `unicode-range`; prefer variable fonts for multiple weights.

## CSS
- Inline/preload critical CSS; avoid render-blocking non-critical styles; extract CSS-in-JS in production.

## Network / caching
- Static assets: `max-age` + content hashing. Cache API responses where safe.
- HTTP/2 or HTTP/3; `preconnect` to known origins; `fetchpriority` on critical resources; eliminate redirects.

## Rendering
- Avoid layout thrashing; animate `transform`/`opacity` only; virtualize long lists.
- `content-visibility: auto` for off-screen content; preserve bfcache eligibility.

## Backend / DB / API
- Eliminate N+1 (eager load / join); index filtered/sorted columns; paginate every list endpoint.
- Connection pooling; slow-query logging.
- API p95 < 200ms; no synchronous heavy compute on the request path; bulk ops over per-row loops; response compression; CDN/edge; load-balancer health checks.
