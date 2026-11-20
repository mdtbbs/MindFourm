/**
 * ffmpeg 合成封装。
 *
 * 所有调用都使用 spawn 参数数组（不经过 shell），输入固定为 Worker 自己
 * 写出的 `frame-%04d.png`，并限制 `-protocol_whitelist file,pipe`。
 * HUD 文本按 drawtext 语法转义；没有可用字体时只保留底部进度条。
 */

import { spawn } from 'node:child_process';
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import {
  TIMELAPSE_FFMPEG_TIMEOUT_MS,
  TIMELAPSE_RENDER_SIZE,
  clampRenderFps,
} from '../../modules/timelapses/timelapse.constants';
import { TimelapseWorkerError } from './errors';

const HUD_HEIGHT = 44;
const HUD_FONT_SIZE = 20;
const HUD_TEXT_MAX_LENGTH = 80;
const STDERR_TAIL_MAX = 8192;

/** 常见字体位置；只有真实存在的文件才会被 drawtext 使用。 */
const DEFAULT_FONT_CANDIDATES = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/noto/NotoSans-Regular.ttf',
  '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
  '/System/Library/Fonts/PingFang.ttc',
  'C:\\Windows\\Fonts\\msyh.ttc',
];

/**
 * 解析 HUD 字体：
 *   - `null` 表示调用方显式禁用；
 *   - 未配置/空串时探测常见字体；
 *   - 找不到字体返回 null（跳过 drawtext）。
 */
export function resolveHudFont(
  configured?: string | null,
  exists: (candidate: string) => boolean = existsSync,
): string | null {
  if (configured === null) return null;
  const candidates = configured?.trim()
    ? [configured.trim(), ...DEFAULT_FONT_CANDIDATES]
    : DEFAULT_FONT_CANDIDATES;
  for (const candidate of candidates) {
    if (candidate && exists(candidate)) return candidate;
  }
  return null;
}

/**
 * 转义 drawtext 文本：反斜杠、单引号、冒号、百分号、逗号、方括号、分号，
 * 以及换行/控制字符（替换为空格）；最多保留 80 个字符。
 */
export function sanitizeHudText(input: unknown): string {
  return Array.from(
    String(input ?? '')
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  ).slice(0, HUD_TEXT_MAX_LENGTH).join('');
}

export function escapeDrawtext(input: unknown): string {
  return sanitizeHudText(input)
    .replace(/\\/g, '\\\\')
    // 冒号在 filtergraph 与 option 两层解析中各需一次转义。
    .replace(/:/g, '\\\\:')
    .replace(/(['%,;\[\]])/g, '\\$1');
}

/** 转义 filter 选项值（字体路径等），不做长度截断。 */
function escapeFilterValue(input: string): string {
  return String(input)
    .replace(/\\/g, '\\\\')
    // 冒号需要 filtergraph + option 两层转义；Windows 盘符路径也依赖这一处理。
    .replace(/:/g, '\\\\:')
    .replace(/(['%,;\[\]])/g, '\\$1');
}

export interface VideoFilterOptions {
  fontFile?: string | null;
  /** 已转义前的原始 HUD 文本（例如地图名 + 最高波次）。 */
  hudText?: string;
  /**
   * HUD 文本文件路径。drawtext 的 `text` 选项要经过 filtergraph 与选项两层解析，
   * 任意玩家地图名都可能触发转义歧义；改成 textfile 后文本内容完全不参与滤镜
   * 语法解析，只需转义受控的文件路径。
   */
  hudTextFile?: string | null;
  /** 视频总时长（秒），用于进度条；<=0 时按 1 秒处理。 */
  durationSeconds?: number;
  targetSize?: number;
}

/** 构造 `-vf`：nearest 缩放 → 偶数 pad → 底部 HUD。 */
export function buildVideoFilter(options: VideoFilterOptions = {}): string {
  const size = options.targetSize ?? TIMELAPSE_RENDER_SIZE;
  const duration = Math.max(0.001, Number(options.durationSeconds) || 0);
  const filters = [
    `scale=${size}:${size}:force_original_aspect_ratio=decrease:flags=neighbor`,
    'pad=ceil(iw/2)*2:ceil(ih/2)*2:(ow-iw)/2:(oh-ih)/2:color=black',
    `drawbox=x=0:y=ih-${HUD_HEIGHT}:w=iw:h=${HUD_HEIGHT}:color=0x000000@0.55:t=fill`,
    `drawbox=x=0:y=ih-6:w=iw*min(1\\,t/${duration}):h=6:color=0x4ade80@0.9:t=fill`,
  ];
  const text = sanitizeHudText(options.hudText);
  if (options.fontFile && text) {
    // 优先用 textfile：文本内容完全不参与滤镜语法解析。调用方未提供文件时
    // 回退到内联文本，并使用 escapeDrawtext 做两层转义；两种方式都关闭
    // `%{...}` 展开，避免地图名里的 `%` 被当作表达式。
    const textOption = options.hudTextFile
      ? `textfile=${escapeFilterValue(options.hudTextFile)}`
      : `text=${escapeDrawtext(text)}`;
    filters.push(
      `drawtext=fontfile=${escapeFilterValue(options.fontFile)}`
      + `:${textOption}:expansion=none`
      + `:fontsize=${HUD_FONT_SIZE}:fontcolor=white:x=12:y=h-${HUD_HEIGHT - 8}`
      + ':shadowcolor=black@0.6:shadowx=1:shadowy=1',
    );
  }
  return filters.join(',');
}

export interface FfmpegVideoArgsOptions {
  workDir: string;
  frameCount: number;
  outputPath: string;
  fontFile?: string | null;
  hudText?: string;
  hudTextFile?: string | null;
  durationSeconds?: number;
  targetSize?: number;
}

/** 导出给测试：稳定的视频合成参数。 */
export function buildFfmpegArgs(options: FfmpegVideoArgsOptions): string[] {
  const fps = clampRenderFps(options.frameCount);
  const inputPattern = path.join(options.workDir, 'frame-%04d.png');
  return [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-protocol_whitelist', 'file,pipe',
    '-framerate', String(fps),
    '-start_number', '0',
    '-i', inputPattern,
    '-vf', buildVideoFilter({
      fontFile: options.fontFile,
      hudText: options.hudText,
      hudTextFile: options.hudTextFile,
      durationSeconds: options.durationSeconds,
      targetSize: options.targetSize,
    }),
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-crf', '24',
    '-preset', 'veryfast',
    '-an',
    options.outputPath,
  ];
}

export interface FfmpegPosterArgsOptions {
  framePath: string;
  outputPath: string;
}

/** 最后一帧 → WebP 封面。 */
export function buildPosterArgs(options: FfmpegPosterArgsOptions): string[] {
  return [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-protocol_whitelist', 'file,pipe',
    '-i', options.framePath,
    '-frames:v', '1',
    '-c:v', 'libwebp',
    '-quality', '82',
    options.outputPath,
  ];
}

export interface RunFfmpegOptions {
  /** 进程超时；超时后用 SIGKILL 强制终止并抛 TIMELAPSE_FFMPEG_TIMEOUT。 */
  timeoutMs?: number;
}

function killProcessTree(child: ReturnType<typeof spawn>): void {
  if (child.pid && process.platform !== 'win32') {
    try {
      // detached 让子进程成为进程组组长，负 pid 可连同其子进程一起杀掉。
      process.kill(-child.pid, 'SIGKILL');
      return;
    } catch {
      // 进程组已消失时回退到单进程 kill。
    }
  }
  try {
    child.kill('SIGKILL');
  } catch {
    // 已退出。
  }
}

function stderrTail(value: string): string {
  const cleaned = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.slice(-STDERR_TAIL_MAX);
}

/** 运行 ffmpeg（参数数组，无 shell）。 */
export function runFfmpeg(
  executable: string,
  args: string[],
  options: RunFfmpegOptions = {},
): Promise<void> {
  const timeoutMs = Number.isFinite(options.timeoutMs) && (options.timeoutMs as number) > 0
    ? Math.floor(options.timeoutMs as number)
    : TIMELAPSE_FFMPEG_TIMEOUT_MS;
  return new Promise<void>((resolve, reject) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(executable, args, {
        stdio: ['ignore', 'ignore', 'pipe'],
        detached: process.platform !== 'win32',
      });
    } catch {
      reject(new TimelapseWorkerError('TIMELAPSE_FFMPEG_UNAVAILABLE', '无法启动 ffmpeg。'));
      return;
    }

    let settled = false;
    let timedOut = false;
    let stderr = '';
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killProcessTree(child);
    }, timeoutMs);

    child.stderr?.on('data', (chunk: Buffer | string) => {
      if (stderr.length < STDERR_TAIL_MAX * 2) stderr += chunk.toString();
    });
    child.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        finish(new TimelapseWorkerError('TIMELAPSE_FFMPEG_UNAVAILABLE', 'ffmpeg 可执行文件不存在。'));
        return;
      }
      finish(new TimelapseWorkerError('TIMELAPSE_FFMPEG_FAILED', 'ffmpeg 启动失败。'));
    });
    child.on('close', (code, signal) => {
      if (timedOut) {
        finish(new TimelapseWorkerError('TIMELAPSE_FFMPEG_TIMEOUT', `ffmpeg 渲染超时（${timeoutMs}ms），已强制终止。`));
        return;
      }
      if (code === 0) {
        finish();
        return;
      }
      const tail = stderrTail(stderr);
      const detail = code === null ? `信号 ${signal ?? 'unknown'}` : `退出码 ${code}`;
      finish(new TimelapseWorkerError('TIMELAPSE_FFMPEG_FAILED', `ffmpeg 合成失败（${detail}）${tail ? `：${tail}` : '。'}`));
    });
  });
}

async function readPrefix(filePath: string, length: number): Promise<Buffer> {
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close().catch(() => undefined);
  }
}

export interface RenderVideoOptions extends FfmpegVideoArgsOptions {
  ffmpegPath?: string;
  timeoutMs?: number;
  run?: typeof runFfmpeg;
}

/** 合成 MP4，并在成功后再做一次容器头校验。 */
export async function renderVideo(options: RenderVideoOptions): Promise<void> {
  const hudText = sanitizeHudText(options.hudText);
  let hudTextFile: string | null = null;
  if (options.fontFile && hudText) {
    // 文本落盘后再交给 drawtext，地图名中的引号/冒号/方括号不会进入滤镜语法。
    hudTextFile = path.join(path.dirname(options.outputPath), 'hud.txt');
    await fs.writeFile(hudTextFile, hudText, { mode: 0o600 });
  }
  const args = buildFfmpegArgs({ ...options, hudTextFile });
  await (options.run ?? runFfmpeg)(options.ffmpegPath || 'ffmpeg', args, { timeoutMs: options.timeoutMs });
  const stat = await fs.stat(options.outputPath).catch(() => null);
  if (!stat || !stat.isFile() || stat.size <= 0) {
    throw new TimelapseWorkerError('TIMELAPSE_FFMPEG_FAILED', 'ffmpeg 未生成有效的视频文件。');
  }
  const prefix = await readPrefix(options.outputPath, 12).catch(() => Buffer.alloc(0));
  if (prefix.length < 8 || prefix.subarray(4, 8).toString('latin1') !== 'ftyp') {
    throw new TimelapseWorkerError('TIMELAPSE_FFMPEG_FAILED', 'ffmpeg 生成的视频不是有效 MP4。');
  }
}

export interface RenderPosterOptions extends FfmpegPosterArgsOptions {
  ffmpegPath?: string;
  timeoutMs?: number;
  run?: typeof runFfmpeg;
}

/** 用最后一帧生成 WebP 封面。 */
export async function renderPoster(options: RenderPosterOptions): Promise<void> {
  const args = buildPosterArgs(options);
  await (options.run ?? runFfmpeg)(options.ffmpegPath || 'ffmpeg', args, { timeoutMs: options.timeoutMs });
  const stat = await fs.stat(options.outputPath).catch(() => null);
  if (!stat || !stat.isFile() || stat.size <= 0) {
    throw new TimelapseWorkerError('TIMELAPSE_FFMPEG_FAILED', 'ffmpeg 未生成有效的封面文件。');
  }
  const prefix = await readPrefix(options.outputPath, 12).catch(() => Buffer.alloc(0));
  if (prefix.length < 12
    || prefix.subarray(0, 4).toString('latin1') !== 'RIFF'
    || prefix.subarray(8, 12).toString('latin1') !== 'WEBP') {
    throw new TimelapseWorkerError('TIMELAPSE_FFMPEG_FAILED', 'ffmpeg 生成的封面不是有效 WebP。');
  }
}
