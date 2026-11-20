import { Body, Controller, Get, Headers, Param, Post, Put, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiParam, ApiProduces, ApiTags } from '@nestjs/swagger';
import { ApiV1, RawHttpResponse } from '../../common/decorators/api-v1.decorator';
import { OAuthOptionalProtected, OAuthProtected } from '../../common/decorators/oauth-protected.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { TimelapsesService } from './timelapses.service';
import { CommitTimelapseDto, CreateTimelapseDraftPostDto } from './dto/timelapse.dto';

function parseRange(header: string | undefined, size: number): { start: number; end: number } | 'invalid' | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return 'invalid';
  let start = match[1] === '' ? null : Number(match[1]);
  let end = match[2] === '' ? null : Number(match[2]);
  if (start === null && end === null) return 'invalid';
  if (start === null) {
    const suffix = end as number;
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return 'invalid';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    if (!Number.isSafeInteger(start)) return 'invalid';
    end = end === null ? size - 1 : Math.min(end, size - 1);
  }
  if (start === undefined || end === null || start > end || start >= size) return 'invalid';
  return { start, end };
}

@ApiV1()
@ApiTags('游戏内容 / 基地延时摄影')
@ApiBearerAuth('MindAuthBearer')
@Controller('v1/timelapses')
export class TimelapsesController {
  constructor(private readonly timelapses: TimelapsesService) {}

  @Post('uploads')
  @OAuthProtected('timelapse.write')
  @RateLimit({ max: 10, window: 60 })
  @ApiOperation({
    summary: '创建延时战报上传会话',
    description: '校验未绑定草稿 ≤ 20、每小时 ≤ 3 次、每日 ≤ 10 次、同时处理中 ≤ 1，返回隔离上传地址。原始帧包上限 25 MB。',
  })
  createUpload(@Req() req: any) {
    return this.timelapses.createUpload(req.user.id);
  }

  @Put('uploads/:id/file')
  @OAuthProtected('timelapse.write')
  @RateLimit({ max: 10, window: 600 })
  @ApiConsumes('application/octet-stream')
  @ApiParam({ name: 'id', description: '延时战报 public_id（UUID）' })
  @ApiOperation({ summary: '上传 .mreplay.zip 原始帧包', description: '以原始字节流写入隔离目录，服务端计算 SHA-256 并限制 25 MB。' })
  uploadFile(@Req() req: any, @Param('id') id: string) {
    return this.timelapses.receiveUpload(req.user.id, id, req);
  }

  @Post(':id/commit')
  @OAuthProtected('timelapse.write')
  @RateLimit({ max: 10, window: 60 })
  @ApiParam({ name: 'id', description: '延时战报 public_id（UUID）' })
  @ApiOperation({ summary: '提交渲染', description: '校验 SHA-256 与 ZIP 基础头信息后推入 Redis 渲染队列；幂等返回当前状态。' })
  commit(@Req() req: any, @Param('id') id: string, @Body() body: CommitTimelapseDto) {
    return this.timelapses.commit(req.user.id, id, body);
  }

  @Get(':id')
  @OAuthOptionalProtected('timelapse.read')
  @RateLimit({ max: 120, window: 60 })
  @ApiParam({ name: 'id', description: '延时战报 public_id（UUID）' })
  @ApiOperation({ summary: '查询延时战报', description: '返回任务状态、聚合战报 JSON、视频与封面播放地址。未通过审核的战报对非作者返回 404。' })
  get(@Req() req: any, @Param('id') id: string) {
    return this.timelapses.getReport(id, req.user || null);
  }

  @Get(':id/video')
  @OAuthOptionalProtected('timelapse.read')
  @RateLimit({ max: 600, window: 60 })
  @RawHttpResponse()
  @ApiProduces('video/mp4')
  @ApiParam({ name: 'id', description: '延时战报 public_id（UUID）' })
  @ApiOperation({ summary: '播放战报视频', description: 'H.264 (yuv420p) MP4，支持单段 Range 请求。未通过审核的战报对非作者返回 404。' })
  async video(@Req() req: any, @Param('id') id: string, @Res() res: any, @Headers('range') range?: string) {
    const { objectKey } = await this.timelapses.getVideo(id, req.user || null);
    const opened = await this.timelapses.openObject(objectKey);
    if (!opened) return res.status(404).end();
    const parsed = parseRange(range, opened.size);
    if (parsed === 'invalid') {
      opened.stream.destroy();
      res.status(416).setHeader('Content-Range', `bytes */${opened.size}`);
      return res.end();
    }
    // 命中 Range 时先释放整文件流，再按区间重新打开，避免同时挂两个文件句柄。
    if (parsed) opened.stream.destroy();
    const etag = `"tl-${opened.size}-${opened.lastModified.getTime()}"`;
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('ETag', etag);
    res.setHeader('Last-Modified', opened.lastModified.toUTCString());
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', parsed ? 'private, max-age=60' : 'private, max-age=300');
    if (parsed) {
      res.status(206);
      res.setHeader('Content-Range', `bytes ${parsed.start}-${parsed.end}/${opened.size}`);
      res.setHeader('Content-Length', String(parsed.end - parsed.start + 1));
      const stream = await this.timelapses.openObject(objectKey, parsed);
      if (!stream) return res.status(404).end();
      stream.stream.on('error', () => (res.headersSent ? res.destroy() : res.status(500).end()));
      return stream.stream.pipe(res);
    }
    res.status(200);
    res.setHeader('Content-Length', String(opened.size));
    opened.stream.on('error', () => (res.headersSent ? res.destroy() : res.status(500).end()));
    return opened.stream.pipe(res);
  }

  @Get(':id/poster')
  @OAuthOptionalProtected('timelapse.read')
  @RateLimit({ max: 300, window: 60 })
  @RawHttpResponse()
  @ApiProduces('image/webp')
  @ApiParam({ name: 'id', description: '延时战报 public_id（UUID）' })
  @ApiOperation({ summary: '读取战报封面', description: '最后一帧生成的 WebP 封面。未通过审核的战报对非作者返回 404。' })
  async poster(@Req() req: any, @Param('id') id: string, @Res() res: any) {
    const { objectKey } = await this.timelapses.getPoster(id, req.user || null);
    const opened = await this.timelapses.openObject(objectKey);
    if (!opened) return res.status(404).end();
    res.status(200);
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Content-Length', String(opened.size));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=300');
    opened.stream.on('error', () => (res.headersSent ? res.destroy() : res.status(500).end()));
    return opened.stream.pipe(res);
  }

  @Post(':id/draft-post')
  @OAuthProtected('timelapse.write')
  @RateLimit({ max: 10, window: 60 })
  @ApiParam({ name: 'id', description: '延时战报 public_id（UUID）' })
  @ApiOperation({ summary: '生成战报草稿帖', description: '创建包含 battleReport 节点的帖子草稿，作者可继续编辑后发布。' })
  draftPost(@Req() req: any, @Param('id') id: string, @Body() body: CreateTimelapseDraftPostDto) {
    return this.timelapses.createDraftPost(req.user.id, id, body);
  }
}
