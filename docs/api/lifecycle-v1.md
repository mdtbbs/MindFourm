# Public V1 API Lifecycle

## Current contract

The current Public Client contract is V1 (`1.0.0`). Its published operation set is an explicit method-and-path allowlist. An operation outside that list is not a third-party API, even if an internal controller uses a `/v1/` route.

The public contract keeps the existing `{ data, meta }` success envelope, `{ error, meta }` failure envelope, OAuth scopes, and authorization behavior. Additive optional fields are compatible; changing required fields, identity meaning, or response shape requires a new major API version.

## Deprecation policy

Do not silently remove a public operation. Before deprecating one:

1. Mark it `deprecated: true` in OpenAPI.
2. Add `x-deprecated-since` with the release identifier.
3. Add `x-removal-plan` with the planned removal version and date.
4. Add `x-migration-guide` pointing to a guide with the replacement operation and request/response changes.
5. Record the change in the [API changelog](/api/v1/docs/changelog) and show the notice in the endpoint reference.

Keep the deprecated operation available for at least 12 months after the notice is published. If the planned date must change, update the changelog and the operation metadata before that date. Removing an operation with a breaking contract requires a new major API version.

## Migration guide requirements

A migration guide must name the affected methods and paths, the reason for the change, the supported replacement, scope changes, parameter and response mapping, error behavior, and a tested client example. If there is no compatible replacement, say so explicitly and publish the removal date.

## Current deprecated operations

None. The internal specification may retain private compatibility routes; their presence does not grant third-party support or require public migration notices.
