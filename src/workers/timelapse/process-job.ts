/**
 * 单个渲染任务的完整流水线：
 *   下载源包 → 标记 processing → 安全解压 → ffmpeg 合成 → 上传产物 → 回写结果。
 *
 * 除“失败结果也无法回写”外，任何错误都会尝试把 failed 结果写回控制面；
 * 只有回写成功才允许从 processing 队列 LREM（由队列循环负责）。
 * 临时目录无论成功失败都会递归清理。
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  TIMELAPSE_MAX_POSTER_BYTES,
  TIMELAPSE_MAX_VIDEO_BYTES,
  TIMELAPSE_WORKER_VERSION,
  clampRenderFps,
  isSafePublicId,
  type TimelapseRenderJob,
  type TimelapseRenderResult,
} from '../../modules/timelapses/timelapse.constants';
import { extractTimelapseArchive } from './archive';
import { TimelapseWorkerError, toFailure } from './errors';
import {
  downloadSource,
  postResult,
  postStart,
  uploadArtifact,
  type FetchLike,
  type HttpRetryOptions,
} from './http';
import { renderPoster, renderVideo, resolveHudFont, type runFfmpeg } from './ffmpeg';
import { workerLog } from './worker-config';

export interface RenderJobDependencies {
  fetchImpl?: FetchLike;
  ffmpegPath?: string;
  /** null 表示禁用 HUD 文本；undefined 表示自动探测字体。 */
  hudFont?: string | null;
  workRoot?: string;
  ffmpegTimeoutMs?: number;
  httpRetries?: number;
  httpBaseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  runFfmpeg?: typeof runFfmpeg;
}

export interface RenderJobOutcome {
  /** true 表示结果已回写控制面，可以从 processing 队列删除消息。 */
  acked: boolean;
  status: 'completed' | 'failed';
  failureCode?: string;
  failureReason?: string;
}

function jobLabel(job: TimelapseRenderJob): string {
  return `job=${job.job_id} timelapse=${job.timelapse_id}`;
}

async function prepareWorkDir(workRoot: string, jobId: string): Promise<string> {
  // 双重校验，确保 job_id 不能把目录带出 workRoot。
  if (!isSafePublicId(jobId)) {
    throw new TimelapseWorkerError('TIMELAPSE_WORK_DIR_FAILED', '任务 ID 不能用于临时目录。');
  }
  const base = path.resolve(workRoot || path.join(os.tmpdir(), 'mdtbbs-timelapse'));
  const dir = path.resolve(base, jobId);
  if (dir !== path.join(base, jobId) || !dir.startsWith(base + path.sep)) {
    throw new TimelapseWorkerError('TIMELAPSE_WORK_DIR_FAILED', '任务临时目录路径不安全。');
  }
  try {
    await fs.mkdir(base, { recursive: true, mode: 0o700 });
    // 同名目录只可能来自上次崩溃；Worker 串行处理，清掉后重建是安全的。
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { mode: 0o700 });
  } catch {
    throw new TimelapseWorkerError('TIMELAPSE_WORK_DIR_FAILED', '无法创建渲染临时目录。');
  }
  return dir;
}

function hudTextFor(mapName: string, maxWave: number): string {
  return maxWave > 0 ? `${mapName} · 最高 ${maxWave} 波` : `${mapName} · 基地延时`;
}

/** 处理一条已通过签名校验的任务；不抛异常，返回是否可以 ACK。 */
export async function processRenderJob(
  job: TimelapseRenderJob,
  deps: RenderJobDependencies = {},
): Promise<RenderJobOutcome> {
  const label = jobLabel(job);
  let workDir: string | null = null;
  const httpOptions: HttpRetryOptions = {
    fetchImpl: deps.fetchImpl,
    retries: deps.httpRetries,
    baseDelayMs: deps.httpBaseDelayMs,
    sleep: deps.sleep,
    onRetry: (attempt, reason) => workerLog('warn', `${label} 回调第 ${attempt} 次重试（${reason}）。`),
  };

  try {
    workDir = await prepareWorkDir(deps.workRoot || path.join(os.tmpdir(), 'mdtbbs-timelapse'), job.job_id);
    workerLog('info', `${label} 开始处理。`);

    const sourcePath = path.join(workDir, 'source.zip');
    await downloadSource(job.source_url, sourcePath, {
      sha256: job.source_sha256,
      size: job.source_size_bytes,
    }, { ...httpOptions, maxBytes: job.source_size_bytes });
    workerLog('info', `${label} 源包下载与校验完成（${job.source_size_bytes} 字节）。`);

    const archiveBuffer = await fs.readFile(sourcePath);
    await postStart(job.start_url, httpOptions);
    workerLog('info', `${label} 已标记 processing。`);

    const archive = await extractTimelapseArchive(archiveBuffer, workDir);
    await fs.rm(sourcePath, { force: true }).catch(() => undefined);
    workerLog('info', `${label} 帧包校验完成：${archive.frameCount} 帧，地图「${archive.manifest.map_name}」。`);

    const videoPath = path.join(workDir, 'video.mp4');
    const posterPath = path.join(workDir, 'poster.webp');
    const fontFile = resolveHudFont(deps.hudFont);
    const durationSeconds = archive.metrics.durationSeconds > 0
      ? archive.metrics.durationSeconds
      : Math.round((archive.frameCount / clampRenderFps(archive.frameCount)) * 100) / 100;
    workerLog('info', `${label} 开始 ffmpeg 合成（fps=${clampRenderFps(archive.frameCount)}，HUD=${fontFile ? 'on' : 'off'}）。`);
    await renderVideo({
      workDir,
      frameCount: archive.frameCount,
      outputPath: videoPath,
      fontFile,
      hudText: hudTextFor(archive.manifest.map_name, archive.metrics.highlights.max_wave),
      durationSeconds,
      ffmpegPath: deps.ffmpegPath,
      timeoutMs: deps.ffmpegTimeoutMs,
      run: deps.runFfmpeg,
    });
    await renderPoster({
      framePath: archive.framePaths[archive.framePaths.length - 1],
      outputPath: posterPath,
      ffmpegPath: deps.ffmpegPath,
      timeoutMs: deps.ffmpegTimeoutMs,
      run: deps.runFfmpeg,
    });
    workerLog('info', `${label} 合成完成，开始上传产物。`);

    await uploadArtifact(job.video_upload_url, videoPath, 'video/mp4', TIMELAPSE_MAX_VIDEO_BYTES, httpOptions);
    await uploadArtifact(job.poster_upload_url, posterPath, 'image/webp', TIMELAPSE_MAX_POSTER_BYTES, httpOptions);

    const result: TimelapseRenderResult = {
      job_id: job.job_id,
      status: 'completed',
      map_name: archive.manifest.map_name,
      map_width: archive.manifest.map_width,
      map_height: archive.manifest.map_height,
      game_mode: archive.manifest.game_mode,
      game_version: archive.manifest.game_version,
      is_multiplayer: archive.manifest.is_multiplayer,
      max_wave: archive.metrics.highlights.max_wave,
      duration_seconds: durationSeconds,
      frame_count: archive.frameCount,
      summary_metrics: archive.metrics.points,
      highlights: archive.metrics.highlights,
      worker_version: TIMELAPSE_WORKER_VERSION,
    };
    await postResult(job.result_url, result, httpOptions);
    workerLog('info', `${label} 处理完成并已回写。`);
    return { acked: true, status: 'completed' };
  } catch (error) {
    const { code, reason } = toFailure(error);
    workerLog('error', `${label} 渲染失败 code=${code} reason=${reason}`);
    const failure: TimelapseRenderResult = {
      job_id: job.job_id,
      status: 'failed',
      failure_code: code,
      failure_reason: reason,
      worker_version: TIMELAPSE_WORKER_VERSION,
    };
    try {
      await postResult(job.result_url, failure, httpOptions);
      workerLog('info', `${label} 失败结果已回写。`);
      return { acked: true, status: 'failed', failureCode: code, failureReason: reason };
    } catch {
      workerLog('error', `${label} 失败结果回写也失败，消息保留在 processing 队列等待人工处理。`);
      return { acked: false, status: 'failed', failureCode: code, failureReason: reason };
    }
  } finally {
    if (workDir) {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => {
        workerLog('warn', `${label} 临时目录清理失败，请人工检查。`);
      });
    }
  }
}
