# Community challenges

Community challenges are an optional, risk-triggered proof step for forum writes. The feature is separate from request rate limits and from content risk review: rate limits bound request volume, content review handles moderation decisions, and a challenge asks a user for additional proof before a write is accepted. Ordinary posting does not show a challenge.

## Trigger rules

The backend currently checks three configurable cases:

- Repeating the same post content within a short window.
- A post containing several links at a high link density.
- A high reply frequency from the same account in a short window.

Rules use the `community_challenge_*` settings keys and can be tuned through the existing settings service. A challenge never clears rate limits or moderation review requirements. Additional actions such as anomalous login or registration can be added through the action/provider interface; authentication challenge ownership stays with MindAuth.

## Verification lifecycle

The provider issues public presentation data and the server stores the expected verification state. The browser receives only an opaque `forumch_v1_` ticket and provider public data. Tickets expire after 180 seconds by default (configurable from 30 to 600), are stored by a SHA-256 digest, and are consumed atomically on first use. Each ticket is bound to the action, signed-in actor, and provider. A ticket for `forum.post.create` cannot authorize `forum.reply.create`, another account, or another provider. The server performs final provider verification before the original request proceeds.

MindAuth registration-question challenges are not accepted by this API. Forum tickets use a separate prefix, storage namespace, action binding, and verification path.

## Providers and configuration

Set `COMMUNITY_CHALLENGE_PROVIDER` to `disabled`, `development`, `turnstile`, or `hcaptcha`.

- `disabled` is the default and produces no CAPTCHA prompt.
- `development` presents a local arithmetic prompt and is rejected in production.
- `turnstile` and `hcaptcha` use server-side Siteverify requests.

For a real provider, configure its public site key in `COMMUNITY_CHALLENGE_TURNSTILE_SITE_KEY` or `COMMUNITY_CHALLENGE_HCAPTCHA_SITE_KEY`, and its secret in the matching `*_SECRET_KEY` variable. Never expose a secret through a `NEXT_PUBLIC_*` variable. Provider integration is behind an interface so more vendors can be added without changing write controllers.

## Client contract

The API reports stable error codes: `CHALLENGE_REQUIRED`, `CHALLENGE_INVALID`, `CHALLENGE_EXPIRED`, and `CHALLENGE_PROVIDER_UNAVAILABLE`. Clients localize those codes themselves. When a challenge is required, the response contains a short-lived challenge descriptor; the client resubmits the same write with `X-Forum-Challenge-Token` and `X-Forum-Challenge-Response` headers. Invalid or replayed tickets must be replaced with a newly issued challenge.

Production needs an operator to configure provider keys and verify Turnstile/hCaptcha behavior in a real browser. The default disabled provider is appropriate for local testing when no risk challenge is required.
