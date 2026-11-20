/**
 * `.mreplay.zip` → 规范化工作目录。
 *
 * 这是 Worker 唯一接触压缩包内容的地方：
 *   - 中央目录由 zip.ts 做安全校验；
 *   - manifest / metrics 只读入内存；
 *   - 帧按 index 顺序校验 PNG 头后写成 `frame-%04d.png`（固定文件名，
 *     绝不使用压缩包内路径）；
 *   - 可选 frames_digest_sha256 与实际帧字节流（按帧序拼接）比对。
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  TIMELAPSE_MAX_FRAMES,
  TIMELAPSE_MIN_FRAMES,
} from '../../modules/timelapses/timelapse.constants';
import { TimelapseArchiveError } from './errors';
import { parseTimelapseManifest, type TimelapseManifest } from './manifest';
import { parseMetricsJsonl, type TimelapseMetricSummary } from './metrics';
import { validatePngHeader } from './png';
import { extractZipEntry, readZipEntries, type ZipEntry } from './zip';

const FRAME_NAME_RE = /^frames\/(\d{4})\.png$/;

export interface ExtractedTimelapseArchive {
  manifest: TimelapseManifest;
  metrics: TimelapseMetricSummary;
  /** 按帧序排列的工作目录绝对路径（frame-0000.png ...）。 */
  framePaths: string[];
  frameCount: number;
}

function archiveIncomplete(message: string): never {
  throw new TimelapseArchiveError('TIMELAPSE_ARCHIVE_INCOMPLETE', message);
}

function frameCountInvalid(message: string): never {
  throw new TimelapseArchiveError('TIMELAPSE_FRAME_COUNT_INVALID', message);
}

function frameInvalid(message: string): never {
  throw new TimelapseArchiveError('TIMELAPSE_FRAME_INVALID', message);
}

function collectFrames(entries: ZipEntry[]): Array<{ index: number; entry: ZipEntry }> {
  const frames: Array<{ index: number; entry: ZipEntry }> = [];
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    if (!entry.name.startsWith('frames/')) continue;
    const match = FRAME_NAME_RE.exec(entry.name);
    if (!match) frameInvalid(`帧文件名必须为 frames/NNNN.png：${entry.name}`);
    frames.push({ index: Number(match[1]), entry });
  }
  frames.sort((left, right) => left.index - right.index);
  if (frames.length < TIMELAPSE_MIN_FRAMES || frames.length > TIMELAPSE_MAX_FRAMES) {
    frameCountInvalid(`帧数必须在 ${TIMELAPSE_MIN_FRAMES}..${TIMELAPSE_MAX_FRAMES} 之间。`);
  }
  for (let index = 0; index < frames.length; index += 1) {
    if (frames[index].index !== index) {
      frameCountInvalid('帧序号必须从 0000 开始连续。');
    }
  }
  return frames;
}

/** 安全解压并校验整个帧包；帧写入 `workDir/frame-%04d.png`。 */
export async function extractTimelapseArchive(buffer: Buffer, workDir: string): Promise<ExtractedTimelapseArchive> {
  const entries = readZipEntries(buffer);
  const manifestEntry = entries.find((entry) => entry.name === 'manifest.json' && !entry.isDirectory);
  const metricsEntry = entries.find((entry) => entry.name === 'metrics.jsonl' && !entry.isDirectory);
  if (!manifestEntry) archiveIncomplete('压缩包缺少 manifest.json。');
  if (!metricsEntry) archiveIncomplete('压缩包缺少 metrics.jsonl。');

  const frames = collectFrames(entries);
  const manifest = parseTimelapseManifest(extractZipEntry(buffer, manifestEntry));
  if (manifest.frame_count !== frames.length) {
    frameCountInvalid(`manifest.json 声明 ${manifest.frame_count} 帧，实际为 ${frames.length} 帧。`);
  }
  const metrics = parseMetricsJsonl(extractZipEntry(buffer, metricsEntry));

  await fs.mkdir(workDir, { recursive: true, mode: 0o700 });
  const digest = createHash('sha256');
  const framePaths: string[] = [];
  for (let index = 0; index < frames.length; index += 1) {
    const bytes = extractZipEntry(buffer, frames[index].entry);
    validatePngHeader(bytes, `帧 ${index}`);
    digest.update(bytes);
    const framePath = path.join(workDir, `frame-${String(index).padStart(4, '0')}.png`);
    try {
      await fs.writeFile(framePath, bytes, { flag: 'wx', mode: 0o600 });
    } catch {
      throw new TimelapseArchiveError('TIMELAPSE_ARCHIVE_WRITE_FAILED', `帧 ${index} 写入工作目录失败。`);
    }
    framePaths.push(framePath);
  }

  if (manifest.frames_digest_sha256) {
    const actual = digest.digest('hex');
    if (actual !== manifest.frames_digest_sha256) {
      throw new TimelapseArchiveError('TIMELAPSE_FRAMES_DIGEST_MISMATCH', '帧序列摘要与 manifest.json 不一致。');
    }
  }

  return { manifest, metrics, framePaths, frameCount: frames.length };
}
