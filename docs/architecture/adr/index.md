# adr
* [Record architecture decisions](0001-record-architecture-decisions.md) - Formalize architecture decision records as immutable documents to preserve structural reasoning and improve onboarding.
* [Approximate sliding-window counter in DynamoDB](0002-approximate-sliding-window-counter-in-dynamodb.md) - Rate limits are enforced by a weighted sliding-window counter stored in the shared DynamoDB table, with both counts saturated at a configurable ceiling.
* [Fail open when the throttling path fails](0003-fail-open-when-the-throttling-path-fails.md) - Any failure inside the throttling path admits the request rather than refusing it, because throttling is resource control and not authorization.
* [Problem-mapping rows contributed per context](0004-problem-mapping-rows-contributed-per-context.md) - Each bounded context owns its RFC 9457 problem rows and the composition root assembles them, keeping shared free of feature-specific types.
* [OpenAPI paths contributed per context](0005-openapi-paths-contributed-per-context.md) - Each bounded context owns its OpenAPI path rows and the composition root assembles them into the published document.
