/**
 * `.mreplay.zip` 的 `manifest.json` 校验。
 *
 * 只接受 v1 协议字段，其余字段（client、mods、started_at 等）由客户端自用，
 * Worker 不信任也不回写。所有长度/范围校验失败都抛 `TIMELAPSE_MANIFEST_INVALID`。
 */

import {
  TIMELAPSE_MAX_MANIFEST_BYTES,
  type TimelapseRenderResult,
} from '../../modules/timelapses/timelapse.constants';
import { TimelapseArchiveError } from './errors';

export interface TimelapseManifest {
  schema_version: 1;
  frame_count: number;
  map_name: string;
  map_width: number | null;
  map_height: number | null;
  game_mode: string | null;
  game_version: string | null;
  is_multiplayer: boolean;
  frames_digest_sha256: string | null;
}

const MAP_NAME_MAX_LENGTH = 160;
const GAME_MODE_MAX_LENGTH = 40;
const GAME_VERSION_MAX_LENGTH = 64;
const MAP_DIMENSION_MAX = 100_000;
const SHA256_RE = /^[a-f0-9]{64}$/i;

function invalid(message: string): never {
  throw new TimelapseArchiveError('TIMELAPSE_MANIFEST_INVALID', message);
}

function requireObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('manifest.json 必须是 JSON 对象。');
  return value as Record<string, unknown>;
}

function optionalInteger(value: unknown, field: string, min: number, max: number): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    invalid(`${field} 必须是 ${min}..${max} 的整数。`);
  }
  return value;
}

function optionalText(value: unknown, field: string, maxLength: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') invalid(`${field} 必须是字符串。`);
  const text = value.trim();
  if (!text) return null;
  if (Array.from(text).length > maxLength) invalid(`${field} 不能超过 ${maxLength} 个字符。`);
  if (/[\u0000-\u001f\u007f]/.test(text)) invalid(`${field} 不能包含控制字符。`);
  return text;
}

/** 解析并校验 manifest；`frame_count` 与真实帧数的一致性由归档层校验。 */
export function parseTimelapseManifest(buffer: Buffer): TimelapseManifest {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) invalid('manifest.json 为空。');
  if (buffer.length > TIMELAPSE_MAX_MANIFEST_BYTES) {
    invalid(`manifest.json 不能超过 ${TIMELAPSE_MAX_MANIFEST_BYTES} 字节。`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(buffer.toString('utf8').replace(/^﻿/, ''));
  } catch {
    invalid('manifest.json 不是合法 JSON。');
  }
  const record = requireObject(parsed);

  if (record.schema_version !== 1) invalid('manifest.json 的 schema_version 必须为 1。');
  const frameCount = record.frame_count;
  if (typeof frameCount !== 'number' || !Number.isInteger(frameCount) || frameCount < 0) {
    invalid('manifest.json 的 frame_count 必须是非负整数。');
  }

  if (typeof record.map_name !== 'string') invalid('manifest.json 缺少 map_name。');
  const mapName = record.map_name.trim();
  if (!mapName) invalid('manifest.json 的 map_name 不能为空。');
  if (Array.from(mapName).length > MAP_NAME_MAX_LENGTH) {
    invalid(`manifest.json 的 map_name 不能超过 ${MAP_NAME_MAX_LENGTH} 个字符。`);
  }
  if (/[\u0000-\u001f\u007f]/.test(mapName)) invalid('manifest.json 的 map_name 不能包含控制字符。');

  if (typeof record.is_multiplayer !== 'boolean') invalid('manifest.json 的 is_multiplayer 必须是布尔值。');

  let framesDigest: string | null = null;
  if (record.frames_digest_sha256 !== undefined && record.frames_digest_sha256 !== null) {
    if (typeof record.frames_digest_sha256 !== 'string' || !SHA256_RE.test(record.frames_digest_sha256)) {
      invalid('manifest.json 的 frames_digest_sha256 必须是 64 位十六进制字符串。');
    }
    framesDigest = record.frames_digest_sha256.toLowerCase();
  }

  return {
    schema_version: 1,
    frame_count: frameCount,
    map_name: mapName,
    map_width: optionalInteger(record.map_width, 'map_width', 0, MAP_DIMENSION_MAX),
    map_height: optionalInteger(record.map_height, 'map_height', 0, MAP_DIMENSION_MAX),
    game_mode: optionalText(record.game_mode, 'game_mode', GAME_MODE_MAX_LENGTH),
    game_version: optionalText(record.game_version, 'game_version', GAME_VERSION_MAX_LENGTH),
    is_multiplayer: record.is_multiplayer,
    frames_digest_sha256: framesDigest,
  };
}

/** manifest → 回写结果中的地图字段（保持 undefined 表示“没有”）。 */
export function manifestResultFields(manifest: TimelapseManifest): Pick<TimelapseRenderResult,
  'map_name' | 'map_width' | 'map_height' | 'game_mode' | 'game_version' | 'is_multiplayer'> {
  return {
    map_name: manifest.map_name,
    map_width: manifest.map_width,
    map_height: manifest.map_height,
    game_mode: manifest.game_mode,
    game_version: manifest.game_version,
    is_multiplayer: manifest.is_multiplayer,
  };
}
