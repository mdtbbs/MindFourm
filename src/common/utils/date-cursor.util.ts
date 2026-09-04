import { BadRequestException } from '@nestjs/common';

/**
 * Keyset-pagination cursors that travel as timestamps.
 *
 * A cursor leaves the server as JSON, so a `Date` arrives back as an ISO-8601 string
 * like `2026-07-26T19:07:14.726Z`. Handing that string straight to MySQL as a
 * DATETIME comparand does not work — and does not fail either: `created_at < 'â€¦Z'`
 * matches zero rows, raises no error and emits no warning, so every "load more"
 * returned an empty page and pagination silently stopped after page one.
 *
 * Passing a `Date` instead lets the driver render the value in the column's own
 * format and timezone. That is what the notifications module already does; these
 * helpers exist so the messages module does not have to rediscover it.
 */

/** Parse an incoming cursor into a `Date` suitable for a query parameter. */
export function parseDateCursor(cursor: string): Date {
  const parsed = new Date(cursor);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException('Invalid cursor');
  }
  return parsed;
}

/**
 * Render a row's timestamp as the cursor to hand back to the client.
 *
 * Accepts what the drivers actually return: a `Date` from the entity mapper, or a
 * string from a raw aggregate such as `MAX(created_at)`.
 */
export function toDateCursor(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
