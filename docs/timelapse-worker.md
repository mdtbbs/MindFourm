# 基地延时摄影渲染 Worker

本文说明独立沙箱渲染 Worker 的部署、运行与运维。Worker 是**独立进程**，只消费
Redis 队列并通过控制面下发的 HMAC 签名 URL 读写数据，不连接 MySQL、不持有用户
会话或数据库凭证。

相关代码：

- 入口：`src/workers/timelapse-worker.ts`
- 流水线：`src/workers/timelapse/process-job.ts`
- 安全解压：`src/workers/timelapse/zip.ts`、`archive.ts`
- ffmpeg：`src/workers/timelapse/ffmpeg.ts`
- 协议常量：`src/modules/timelapses/timelapse.constants.ts`
- 签名工具：`src/common/utils/timelapse-signing.util.ts`

## 1. 数据流

```text
控制面 commit
  └─ LPUSH forum:timelapse:jobs  (JSON + HMAC 签名)
        │
        ▼
Worker  BRPOPLPUSH forum:timelapse:jobs forum:timelapse:processing
  ├─ 校验队列消息签名（失败：记录并 LREM，不执行）
  ├─ GET source_url            流式下载 ≤25 MB，校验 SHA-256/大小
  ├─ POST start_url            重试 3 次（指数退避）
  ├─ 安全解压 .mreplay.zip     manifest / metrics / frames → 临时目录
  ├─ ffmpeg 合成               H.264 MP4 + 最后帧 WebP
  ├─ PUT video_upload_url      video/mp4
  ├─ PUT poster_upload_url     image/webp
  └─ POST result_url           completed / failed
        │
        └─ 回写成功后 LREM forum:timelapse:processing <原消息>
```

串行处理（并发 1）。`BRPOPLPUSH` 保证取出的消息不会丢失：Worker 崩溃时消息留在
`forum:timelapse:processing`，需要人工确认后重放。

## 2. 前置条件

- Node.js **20.9+**（与控制面一致；Worker 使用全局 `fetch`）。
- ffmpeg 可执行文件，必须包含：
  - `libx264` 编码器（MP4）；
  - `libwebp` 编码器（封面）；
  - `drawtext` / `drawbox` / `scale` / `pad` 滤镜（HUD）。
  - 建议 ffmpeg **5.x 或更新版本**：进度条使用 `drawbox` 的时间表达式。
- 可选字体：HUD 文本需要 TrueType/OpenType 字体。没有字体时 Worker 会自动跳过
  `drawtext`，仅保留底部进度条，不影响合成。
- 与控制面相同的 Redis 实例/DB，以及完全一致的 `TIMELAPSE_WORKER_SECRET`。

自检命令：

```bash
ffmpeg -version
ffmpeg -hide_banner -encoders | grep -E 'libx264|libwebp'
fc-list | grep -i -E 'noto|dejavu' | head
```

## 3. 配置

将 `timelapse-worker.env.example` 复制为独立 env 文件（例如
`/etc/mindfourm/timelapse-worker.env`），至少填写 Redis 与共享 secret。

| 变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `TIMELAPSE_WORKER_SECRET` | 是 | 无 | 与控制面完全一致；为空时 Worker 打印错误并以非 0 退出 |
| `REDIS_HOST` | 否 | `localhost` | Redis 地址 |
| `REDIS_PORT` | 否 | `6379` | Redis 端口 |
| `REDIS_PASSWORD` | 否 | 空 | Redis 密码 |
| `REDIS_DB` | 否 | `0` | Redis DB；必须与控制面一致 |
| `FFMPEG_PATH` | 否 | `ffmpeg` | ffmpeg 可执行文件路径 |
| `TIMELAPSE_HUD_FONT` | 否 | 自动探测 | HUD 字体路径；未设置时尝试 DejaVu/Noto 常见位置 |
| `TIMELAPSE_WORK_DIR` | 否 | `$TMPDIR/mdtbbs-timelapse` | 任务临时目录根；每个任务使用 `<root>/<job_id>` |
| `WORKER_POLL_TIMEOUT_SECONDS` | 否 | `5` | `BRPOPLPUSH` 阻塞秒数（1..60） |
| `TIMELAPSE_WORKER_ENV_FILE` | 否 | 项目根 `.env` | 启动时额外加载的 env 文件路径 |

注意：

- 不要把控制面数据库凭证放进 Worker 容器/主机。
- 修改 `TIMELAPSE_WORKER_SECRET` 时必须同时更新控制面与 Worker，并重启 Worker；
  旧消息会因签名失败被丢弃。
- 日志只输出 `job_id` / `timelapse_id` / 失败码，不输出 secret、完整签名 URL。

## 4. 构建与运行

```bash
npm ci
npm run build:backend
TIMELAPSE_WORKER_ENV_FILE=/etc/mindfourm/timelapse-worker.env \
  npm run start:timelapse-worker
```

开发模式（`nest --watch`，入口为 `workers/timelapse-worker`）：

```bash
npm run dev:timelapse-worker
```

`TIMELAPSE_WORKER_ENV_FILE` 不存在时，Worker 会尝试加载项目根目录 `.env`；
`dotenv` 不会覆盖已经存在的环境变量。

### systemd 示例

```ini
[Unit]
Description=MindFourm timelapse render worker
After=network-online.target redis-server.service
Wants=network-online.target

[Service]
Type=simple
User=mindfourm
Group=mindfourm
WorkingDirectory=/opt/mindfourm
EnvironmentFile=/etc/mindfourm/timelapse-worker.env
ExecStart=/usr/bin/node /opt/mindfourm/dist/workers/timelapse-worker.js
Restart=always
RestartSec=5
TimeoutStopSec=90
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/mindfourm/timelapse-work
MemoryMax=512M
# 沙箱建议：只允许访问 Redis 与控制面出站；无需入站端口。
[Install]
WantedBy=multi-user.target
```

`TIMELAPSE_WORK_DIR` 应指向 `ReadWritePaths` 允许的目录。Worker 串行渲染，内存上限
512 MB 足够处理 25 MB 帧包与 64 MB 成片；ffmpeg 子进程也计入该上限。

### 容器化建议

- 以非 root 用户运行，根文件系统只读；
- 仅挂载临时目录（可 `tmpfs`）作为 `TIMELAPSE_WORK_DIR`；
- 不暴露任何入站端口，只允许出站到 Redis 与控制面；
- 固定 ffmpeg 版本并在构建时校验 `libx264`/`libwebp`；
- 建议加 `--memory=512m --pids-limit=128 --security-opt=no-new-privileges`。

## 5. 输入帧包与安全限制

`.mreplay.zip` v1 结构：

```text
manifest.json     schema_version=1, frame_count, map_name, map_width/map_height,
                  game_mode, game_version, is_multiplayer, frames_digest_sha256(可选)
metrics.jsonl     每行 {"idx":0,"elapsed_sec":0,"wave":1,...}
frames/0000.png   从 0000 连续编号的缩略帧
```

Worker 强制执行的限制：

| 项目 | 上限 |
| --- | --- |
| 源包 `.zip` | 25 MB |
| 解压总量 | 80 MB |
| ZIP 条目数 | 512 |
| 单帧解压后 | 4 MB |
| 帧数 | 5..180，且从 `0000` 连续 |
| 帧文件名 | 必须为 `frames/NNNN.png` |
| PNG 尺寸 | 宽高 1..1024，且 IHDR bit depth / color type 合法 |
| manifest.json | 64 KB |
| metrics.jsonl | 单行 4 KB、最多 1000 行 |
| 图表摘要 | 最多 120 点、序列化 ≤60 KB |

拒绝的 ZIP 特性：绝对路径、`..`、NUL/控制字符、反斜杠、盘符、符号链接、加密、
分卷、zip64、未知压缩方法，以及声明尺寸/实际解压/CRC-32 不一致。压缩包内**任何
路径都不会直接用于磁盘写盘**：帧统一写成临时目录下的
`frame-0000.png ... frame-NNNN.png`。

metrics 清洗规则：未知字段丢弃；`idx` 必须是有限非负整数，重复 `idx` 保留最后
一条并按升序排序；数值 clamp 到 `[0, 1e12]`；均匀降采样到 ≤120 点并保留首尾。

## 6. 合成参数

- `fps = clamp(frame_count / 18, 4, 15)`（`clampRenderFps`）；
- 帧序列：`frame-%04d.png`，`-start_number 0`；
- 视频滤镜：`scale=720:720:force_original_aspect_ratio=decrease:flags=neighbor` →
  `pad=ceil(iw/2)*2:ceil(ih/2)*2`（偶数尺寸、居中黑边）→ 底部 HUD：
  - `drawbox` 半透明底栏；
  - `drawbox` 时间进度条；
  - 有字体时 `drawtext`（地图名 + 最高波次）。HUD 文本先写入工作目录的
    `hud.txt`，通过 `textfile` 传给 drawtext，并设置 `expansion=none`；
    玩家可控的地图名不会进入 filtergraph 语法。直接调用
    `buildFfmpegArgs()` 且未提供 `hudTextFile` 时会回退为内联文本，使用
    `escapeDrawtext()` 做 filtergraph/option 两层转义。
- 编码：`-c:v libx264 -pix_fmt yuv420p -movflags +faststart -crf 24
  -preset veryfast -an`；
- 输入选项：`-protocol_whitelist file,pipe`；`spawn` 参数数组，不经过 shell；
- 超时：默认 60 秒（常量 `TIMELAPSE_FFMPEG_TIMEOUT_MS`，测试/调用方可注入），超时后对进程组
  发送 `SIGKILL`，失败码 `TIMELAPSE_FFMPEG_TIMEOUT`；
- 封面：最后一帧 → `libwebp`，`-quality 82`，失败码 `TIMELAPSE_FFMPEG_FAILED`。

## 7. 回写与 ACK

- `POST start_url`：标记 `processing`，失败重试 3 次（指数退避）。
- `PUT video_upload_url`：`Content-Type: video/mp4`，≤64 MB。
- `PUT poster_upload_url`：`Content-Type: image/webp`，≤2 MB。
- `POST result_url`：成功时 `status=completed`，携带地图字段、帧数、时长、
  清洗后的 `summary_metrics` 与 `highlights`；失败时 `status=failed`、
  `failure_code`、`failure_reason`（≤255 字符）。
- 只有结果回写成功后才 `LREM` 原消息。签名失败/结构非法/已过期的消息直接丢弃并
  `LREM`。若失败结果也无法回写，消息留在 `forum:timelapse:processing`，Worker
  继续处理下一条。

### 失败码

| 失败码 | 含义 |
| --- | --- |
| `TIMELAPSE_JOB_SIGNATURE_INVALID` | 队列消息签名不匹配（消息被丢弃） |
| `TIMELAPSE_JOB_INVALID` | 消息结构/字段非法（消息被丢弃） |
| `TIMELAPSE_JOB_EXPIRED` | 签名 URL 已过期（消息被丢弃） |
| `WORKER_SOURCE_INVALID` | 源包下载、大小或 SHA-256 校验失败 |
| `TIMELAPSE_ZIP_UNSAFE_PATH` | 路径穿越/绝对路径/反斜杠/盘符/NUL |
| `TIMELAPSE_ZIP_SYMLINK` | 符号链接 |
| `TIMELAPSE_ZIP_ENCRYPTED` | 加密条目 |
| `TIMELAPSE_ZIP_UNSUPPORTED` | 分卷、zip64、掩码头 |
| `TIMELAPSE_ZIP_UNSUPPORTED_METHOD` | 未知压缩方法 |
| `TIMELAPSE_ZIP_BOMB` | 解压总量/单条/实际解压超限 |
| `TIMELAPSE_ZIP_INVALID` | 中央目录/CRC/长度损坏 |
| `TIMELAPSE_ARCHIVE_INCOMPLETE` | 缺少 `manifest.json` 或 `metrics.jsonl` |
| `TIMELAPSE_ARCHIVE_WRITE_FAILED` | 帧写入临时工作目录失败 |
| `TIMELAPSE_FRAME_COUNT_INVALID` | 帧数不在 5..180、序号不连续或与 manifest 不符 |
| `TIMELAPSE_FRAME_INVALID` | 帧名/PNG 魔数/IHDR 尺寸/bit depth 非法 |
| `TIMELAPSE_MANIFEST_INVALID` | manifest 字段或长度非法 |
| `TIMELAPSE_METRICS_INVALID` | metrics 单行/行数超限 |
| `TIMELAPSE_FRAMES_DIGEST_MISMATCH` | 帧序列摘要与 manifest 不一致 |
| `TIMELAPSE_FFMPEG_TIMEOUT` | ffmpeg 超过 60 秒，已 SIGKILL |
| `TIMELAPSE_FFMPEG_FAILED` | ffmpeg 非零退出或产物头无效 |
| `TIMELAPSE_FFMPEG_UNAVAILABLE` | 找不到 ffmpeg 可执行文件 |
| `TIMELAPSE_WORKER_START_FAILED` | `start_url` 回调失败 |
| `TIMELAPSE_WORKER_UPLOAD_FAILED` | 视频/封面上传失败 |
| `TIMELAPSE_WORKER_RESULT_FAILED` | 结果回写失败（消息保留在 processing） |
| `TIMELAPSE_WORK_DIR_FAILED` | 临时目录创建/路径校验失败 |
| `TIMELAPSE_ARTIFACT_MISSING` / `TIMELAPSE_ARTIFACT_TOO_LARGE` | 产物为空/缺失或超过上传上限 |
| `TIMELAPSE_RENDER_FAILED` | 未归类的渲染异常 |

## 8. 临时目录与清理

- 根目录：`TIMELAPSE_WORK_DIR`（默认 `os.tmpdir()/mdtbbs-timelapse`）。
- 每任务目录：`<root>/<job_id>`，`job_id` 必须是 UUID，且解析后的路径必须仍在
  根目录内；目录以 `0700` 创建。
- 任务结束（成功或失败）后递归删除整个任务目录。进程被 `SIGKILL`/断电时可能
  残留目录，需按运维流程清理：
  ```bash
  find "$TIMELAPSE_WORK_DIR" -mindepth 1 -maxdepth 1 -type d -mmin +360 -print
  # 确认无 Worker 正在运行后再删除
  ```
- 源包下载完成后会尽快删除 `source.zip`，帧与产物只存在于任务目录。

## 9. 运维

```bash
# 队列积压
redis-cli LLEN forum:timelapse:jobs
redis-cli LLEN forum:timelapse:processing

# 查看 processing 中最早的一条（不要直接打印 secret；消息含签名 URL）
redis-cli LINDEX forum:timelapse:processing 0

# 人工重放一条（Redis 6.2+；确认 Worker 已停止或该消息确实需要重试）
redis-cli LMOVE forum:timelapse:processing forum:timelapse:jobs RIGHT LEFT
```

- Worker 启动日志应包含 `Redis 已连接` 与队列名；若反复出现 `Redis 连接错误`，
  检查网络、密码与 DB。
- `TIMELAPSE_WORKER_SECRET` 为空时进程会立即以退出码 1 结束。
- `SIGINT/SIGTERM`：空闲时立即退出；正在渲染时等待当前任务结束（最长约 60 秒
  ffmpeg 超时 + 回写重试时间）。systemd 的 `TimeoutStopSec` 建议 ≥90 秒。
- 同一 Redis 队列可以启动多个 Worker 进程；每个进程内并发 1，`BRPOPLPUSH` 保证
  任务不会被重复取走。若需要更高吞吐，优先增加 Worker 实例并评估控制面/存储压力。
- 建议给进程加内存上限（512 MB）与 `pids-limit`，避免异常帧包拖垮宿主机。

## 10. 测试

```bash
# Worker 单测（含真实 ffmpeg 集成；没有 ffmpeg 时自动 skip）
npx jest src/workers/timelapse --runInBand

# 后端类型检查
npx tsc --noEmit -p tsconfig.json
```

测试覆盖：合法 store/deflate ZIP、CRC、路径穿越（`../`、绝对路径、盘符、反斜杠、
NUL）、符号链接、加密/分卷/zip64/未知压缩方法、解压炸弹、伪造 PNG、IHDR 超限、
帧数 4/181、manifest 字段、metrics 清洗/降采样/60 KB、drawtext 转义、ffmpeg 参数、
ffmpeg 超时（临时 shell 脚本 + 100 ms 超时）、队列签名，以及假 fetch/假 ffmpeg 的
完整流水线与失败回写。
