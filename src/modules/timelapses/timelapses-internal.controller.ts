import { Body, Controller, ForbiddenException, Get, Param, Post, Put, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipPhoneVerification } from '../../common/decorators/skip-phone-verification.decorator';
import { verifyTimelapseRequest } from '../../common/utils/timelapse-signing.util';
import { TimelapsesService } from './timelapses.service';
import type { TimelapseRenderResult } from './timelapse.constants';

/**
 * 渲染 Worker 的签名内部接口。
 *
 * Worker 没有数据库/会话凭证，只能凭控制面随任务下发的 HMAC 签名 URL 读写。
 * 签名覆盖 HTTP 方法、完整路径与过期时间；任一不符立即 403。
 */
@Controller('internal/timelapses')
@SkipPhoneVerification()
export class TimelapsesInternalController {
  constructor(private readonly timelapses: TimelapsesService, private readonly config: ConfigService) {}

  @Get(':id/source')
  async source(@Param('id') id: string, @Req() req: any, @Res() res: any) {
    this.verify(req, 'GET');
    const { objectKey } = await this.timelapses.getInternalSource(id);
    const opened = await this.timelapses.openObject(objectKey);
    if (!opened) return res.status(404).end();
    res.status(200);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Length', String(opened.size));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    opened.stream.on('error', () => (res.headersSent ? res.destroy() : res.status(500).end()));
    return opened.stream.pipe(res);
  }

  @Post(':id/start')
  start(@Param('id') id: string, @Req() req: any) {
    this.verify(req, 'POST');
    return this.timelapses.markProcessing(id);
  }

  @Put(':id/result/video')
  video(@Param('id') id: string, @Req() req: any) {
    this.verify(req, 'PUT');
    return this.timelapses.writeArtifact(id, 'video', req);
  }

  @Put(':id/result/poster')
  poster(@Param('id') id: string, @Req() req: any) {
    this.verify(req, 'PUT');
    return this.timelapses.writeArtifact(id, 'poster', req);
  }

  @Post(':id/result')
  result(@Param('id') id: string, @Body() body: TimelapseRenderResult, @Req() req: any) {
    this.verify(req, 'POST');
    return this.timelapses.applyRenderResult(id, body);
  }

  private verify(req: any, method: string): void {
    const secret = String(this.config.get('timelapse.workerSecret') || process.env.TIMELAPSE_WORKER_SECRET || '');
    const path = String(req.originalUrl || req.url || '').split('?')[0];
    const expiresAt = Number(req.query?.expires);
    const signature = String(req.query?.signature || '');
    if (!secret || !verifyTimelapseRequest(secret, method, path, expiresAt, signature)) {
      throw new ForbiddenException({ code: 'TIMELAPSE_INTERNAL_SIGNATURE_INVALID', message: '内部签名无效或已过期。' });
    }
  }
}
