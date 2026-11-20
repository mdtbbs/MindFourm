/**
 * 渲染 Worker 的稳定错误类型与失败码。
 *
 * 失败码会原样写入 `timelapse_reports.failure_code`（控制面会再次做
 * `[A-Z0-9_]` 清洗），因此这里只使用大写下划线形式的稳定标识。
 * 所有错误消息都用中文，且不得包含签名、secret 或完整 URL。
 */

/** 失败时回写给控制面的 reason 上限。 */
export const TIMELAPSE_FAILURE_REASON_MAX_LENGTH = 255;

/** Worker 自定义错误：`code` 用于控制面展示与排查。 */
export class TimelapseWorkerError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'TimelapseWorkerError';
    this.code = code;
  }
}

/** 压缩包/帧包校验错误；与普通渲染错误区分，便于测试按类型断言。 */
export class TimelapseArchiveError extends TimelapseWorkerError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'TimelapseArchiveError';
  }
}

/** 把任意异常整理成可回写的失败码与 ≤255 字符的中文说明。 */
export function toFailure(error: unknown): { code: string; reason: string } {
  const code = error instanceof TimelapseWorkerError ? error.code : 'TIMELAPSE_RENDER_FAILED';
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const reason = raw
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, TIMELAPSE_FAILURE_REASON_MAX_LENGTH);
  return { code, reason: reason || '渲染失败' };
}
