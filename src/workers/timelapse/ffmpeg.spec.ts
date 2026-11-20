/**
 * ffmpeg 参数构造、drawtext 转义、超时强杀与（可选）真实 ffmpeg 集成测试。
 * 真实合成只在 PATH 中存在 ffmpeg 时运行，否则整组 skip。
 */

import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { clampRenderFps } from '../../modules/timelapses/timelapse.constants';
import {
  buildFfmpegArgs,
  buildPosterArgs,
  buildVideoFilter,
  escapeDrawtext,
  renderPoster,
  renderVideo,
  resolveHudFont,
  runFfmpeg,
} from './ffmpeg';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mdtl-ffmpeg-'));
  tempDirs.push(dir);
  return dir;
}

describe('escapeDrawtext', () => {
  it('转义 drawtext/filtergraph 元字符并替换控制字符', () => {
    const input = "a\\b'c:d%e,f[g]h;i\nj\tk";
    expect(escapeDrawtext(input)).toBe(String.raw`a\\b\'c\\:d\%e\,f\[g\]h\;i j k`);
  });

  it('限制为 80 个字符', () => {
    expect(escapeDrawtext('x'.repeat(100))).toHaveLength(80);
  });

  it('处理空值与纯空白', () => {
    expect(escapeDrawtext(undefined)).toBe('');
    expect(escapeDrawtext(' \n\t ')).toBe('');
  });

  it('转义 drawtext 文本展开语法', () => {
    expect(escapeDrawtext('%{pts:hms}')).toBe(String.raw`\%{pts\\:hms}`);
  });
});

describe('buildFfmpegArgs', () => {
  const base = {
    workDir: '/tmp/mdtbbs-timelapse/job',
    frameCount: 180,
    outputPath: '/tmp/mdtbbs-timelapse/job/video.mp4',
    fontFile: null as string | null,
    hudText: 'Serpulo · 最高 20 波',
    durationSeconds: 18,
  };

  it('构造 H.264 参数并使用 clampRenderFps', () => {
    const args = buildFfmpegArgs(base);
    expect(args[args.indexOf('-framerate') + 1]).toBe(String(clampRenderFps(180)));
    expect(args[args.indexOf('-protocol_whitelist') + 1]).toBe('file,pipe');
    expect(args[args.indexOf('-start_number') + 1]).toBe('0');
    expect(args[args.indexOf('-i') + 1]).toBe(path.join(base.workDir, 'frame-%04d.png'));
    expect(args).toEqual(expect.arrayContaining([
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      '-crf', '24', '-preset', 'veryfast', '-an',
    ]));
    expect(args[args.length - 1]).toBe(base.outputPath);
    const vf = args[args.indexOf('-vf') + 1];
    expect(vf).toContain('scale=720:720:force_original_aspect_ratio=decrease:flags=neighbor');
    expect(vf).toContain('pad=ceil(iw/2)*2:ceil(ih/2)*2');
    expect(vf).toContain('drawbox=');
    expect(vf).toContain('color=0x000000@0.55');
    expect(vf).not.toContain('drawtext');
  });

  it('有字体时通过 textfile 传递 HUD 文本并关闭展开', () => {
    const args = buildFfmpegArgs({
      ...base,
      fontFile: '/usr/share/fonts/dejavu.ttf',
      hudText: "A:B, C [D]; E%F'G\\H",
      hudTextFile: '/tmp/mdtbbs-timelapse/job/hud.txt',
    });
    const vf = args[args.indexOf('-vf') + 1];
    expect(vf).toContain('drawtext=fontfile=/usr/share/fonts/dejavu.ttf:textfile=/tmp/mdtbbs-timelapse/job/hud.txt');
    expect(vf).toContain('expansion=none');
    expect(vf).toContain('fontsize=20');
    // 文本内容不进入滤镜字符串，地图名里的元字符不会破坏语法。
    expect(vf).not.toContain('A:B');
  });

  it('没有 textfile 时回退为内联安全转义文本', () => {
    const args = buildFfmpegArgs({ ...base, fontFile: '/fonts/test.ttf', hudText: 'A:B,C' });
    const vf = args[args.indexOf('-vf') + 1];
    expect(vf).toContain(String.raw`drawtext=fontfile=/fonts/test.ttf:text=A\\:B\,C:expansion=none`);
  });

  it('转义字体与文本文件路径中的冒号/反斜杠', () => {
    const filter = buildVideoFilter({
      fontFile: 'C:\\Windows\\Fonts\\msyh.ttc',
      hudTextFile: '/tmp/a:b/hud.txt',
      hudText: 'Serpulo',
      durationSeconds: 1,
    });
    expect(filter).toContain(String.raw`fontfile=C\\:\\Windows\\Fonts\\msyh.ttc`);
    expect(filter).toContain(String.raw`textfile=/tmp/a\\:b/hud.txt`);
  });

  it('clampRenderFps 对 5 帧使用 4 fps', () => {
    const args = buildFfmpegArgs({ ...base, frameCount: 5 });
    expect(args[args.indexOf('-framerate') + 1]).toBe('4');
  });

  it('buildVideoFilter 对 0 时长做保护', () => {
    const filter = buildVideoFilter({ fontFile: null, durationSeconds: 0 });
    expect(filter).toContain('min(1\\,t/0.001)');
  });

  it('构造 WebP 封面参数', () => {
    const args = buildPosterArgs({ framePath: '/tmp/job/frame-0004.png', outputPath: '/tmp/job/poster.webp' });
    expect(args[args.indexOf('-i') + 1]).toBe('/tmp/job/frame-0004.png');
    expect(args).toEqual(expect.arrayContaining(['-frames:v', '1', '-c:v', 'libwebp', '-quality', '82']));
    expect(args[args.indexOf('-protocol_whitelist') + 1]).toBe('file,pipe');
    expect(args[args.length - 1]).toBe('/tmp/job/poster.webp');
  });
});

describe('resolveHudFont', () => {
  it('显式 null 表示禁用 drawtext', () => {
    expect(resolveHudFont(null)).toBeNull();
  });

  it('优先使用存在配置字体，否则回退常见字体', () => {
    expect(resolveHudFont('/custom/font.ttf', (candidate) => candidate === '/custom/font.ttf')).toBe('/custom/font.ttf');
    expect(resolveHudFont('/missing/font.ttf', (candidate) => candidate === '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
      .toBe('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf');
  });

  it('没有任何字体时返回 null', () => {
    expect(resolveHudFont(undefined, () => false)).toBeNull();
  });
});

describe('runFfmpeg', () => {
  it('超时后 SIGKILL 并抛 TIMELAPSE_FFMPEG_TIMEOUT', async () => {
    const dir = await tempDir();
    const script = path.join(dir, 'slow.sh');
    await fs.writeFile(script, '#!/bin/sh\nsleep 5\n', { mode: 0o700 });
    const start = Date.now();
    try {
      await runFfmpeg(script, [], { timeoutMs: 100 });
      throw new Error('期望超时');
    } catch (error: any) {
      expect(error.code).toBe('TIMELAPSE_FFMPEG_TIMEOUT');
    }
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it('非零退出码抛 TIMELAPSE_FFMPEG_FAILED', async () => {
    try {
      await runFfmpeg(process.execPath, ['-e', 'process.exit(3)'], { timeoutMs: 5000 });
      throw new Error('期望失败');
    } catch (error: any) {
      expect(error.code).toBe('TIMELAPSE_FFMPEG_FAILED');
    }
  });

  it('可执行文件不存在时抛 TIMELAPSE_FFMPEG_UNAVAILABLE', async () => {
    try {
      await runFfmpeg('/definitely/not/a/real/ffmpeg', [], { timeoutMs: 1000 });
      throw new Error('期望失败');
    } catch (error: any) {
      expect(error.code).toBe('TIMELAPSE_FFMPEG_UNAVAILABLE');
    }
  });
});

const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
const ffmpegAvailable = spawnSync(ffmpegPath, ['-version'], { stdio: 'ignore' }).status === 0;
const maybeIt = ffmpegAvailable ? it : it.skip;
const fontFile = resolveHudFont();

async function writeFrames(dir: string, count = 5): Promise<string[]> {
  const colors = [
    { r: 220, g: 40, b: 40 },
    { r: 40, g: 180, b: 60 },
    { r: 40, g: 80, b: 220 },
    { r: 220, g: 200, b: 40 },
    { r: 40, g: 200, b: 200 },
  ];
  const paths: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const framePath = path.join(dir, `frame-${String(index).padStart(4, '0')}.png`);
    const color = colors[index % colors.length];
    await sharp({ create: { width: 64, height: 64, channels: 3, background: color } }).png().toFile(framePath);
    paths.push(framePath);
  }
  return paths;
}

describe('ffmpeg 集成（有 ffmpeg 才运行）', () => {
  maybeIt('合成 5 帧 H.264 MP4 与 WebP 封面', async () => {
    const dir = await tempDir();
    const frames = await writeFrames(dir, 5);
    const videoPath = path.join(dir, 'video.mp4');
    const posterPath = path.join(dir, 'poster.webp');
    await renderVideo({
      workDir: dir,
      frameCount: 5,
      outputPath: videoPath,
      fontFile: null,
      hudText: 'Serpulo',
      durationSeconds: 1.25,
      ffmpegPath,
      timeoutMs: 30_000,
    });
    const video = await fs.readFile(videoPath);
    expect(video.length).toBeGreaterThan(0);
    expect(video.subarray(4, 8).toString('latin1')).toBe('ftyp');

    await renderPoster({ framePath: frames[frames.length - 1], outputPath: posterPath, ffmpegPath, timeoutMs: 30_000 });
    const poster = await fs.readFile(posterPath);
    expect(poster.subarray(0, 4).toString('latin1')).toBe('RIFF');
    expect(poster.subarray(8, 12).toString('latin1')).toBe('WEBP');
  }, 60_000);

  const maybeFontIt = ffmpegAvailable && fontFile ? it : it.skip;
  maybeFontIt('带特殊字符 HUD 文本与字体时仍能合成', async () => {
    const dir = await tempDir();
    await writeFrames(dir, 5);
    const videoPath = path.join(dir, 'hud.mp4');
    await renderVideo({
      workDir: dir,
      frameCount: 5,
      outputPath: videoPath,
      fontFile,
      hudText: "A:B, [C]; 50% 'D'\\E",
      durationSeconds: 2,
      ffmpegPath,
      timeoutMs: 30_000,
    });
    const video = await fs.readFile(videoPath);
    expect(video.subarray(4, 8).toString('latin1')).toBe('ftyp');
  }, 60_000);
});
