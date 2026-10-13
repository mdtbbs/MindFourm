/**
 * Reports how an HTTP download stream actually ended.
 *
 * A download only counts as completed when the response finished writing the
 * whole body. An aborted connection (`close` without `writableFinished`), a
 * read error, or a 4xx/5xx status must not be recorded as a completed
 * download. The first terminal signal wins: Express emits `finish` and then
 * `close`, and a failing read raises `error` before either.
 *
 * Shared by every route that streams bytes itself — the game-content map
 * route, the legacy web download route and the public V1 file route — so all
 * three report the same event sequence to the download ledger.
 */
export type StreamCompletionEvent = 'completed' | 'failed';

type StreamLike = { once(event: 'error', listener: () => void): unknown };
type ResponseLike = {
  once(event: 'finish' | 'close', listener: () => void): unknown;
  statusCode: number;
  writableFinished?: boolean;
};

export function observeStreamCompletion(
  stream: StreamLike,
  response: ResponseLike,
  report: (event: StreamCompletionEvent) => void,
): void {
  let reported = false;
  const finish = (event: StreamCompletionEvent) => {
    if (reported) return;
    reported = true;
    report(event);
  };
  stream.once('error', () => finish('failed'));
  response.once('finish', () => finish(response.statusCode < 400 ? 'completed' : 'failed'));
  response.once('close', () => { if (!response.writableFinished) finish('failed'); });
}
