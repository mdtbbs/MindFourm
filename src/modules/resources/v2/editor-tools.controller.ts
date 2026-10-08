import {
  BadRequestException, Body, Controller, Get, Param, Post, Res, ServiceUnavailableException,
  UploadedFile, UseInterceptors, ValidationPipe,
} from '@nestjs/common';
import {
  ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiParam, ApiProduces, ApiTags,
} from '@nestjs/swagger';
import { readFile } from 'node:fs/promises';
import { Response } from 'express';
import { ApiV1, RawHttpResponse } from '@common/decorators/api-v1.decorator';
import { OAuthOptionalProtected } from '@common/decorators/oauth-protected.decorator';
import { RateLimit } from '@common/decorators/rate-limit.decorator';
import { attachmentContentDisposition } from '@common/utils/content-disposition.util';
import { assertSafeUploadedFile } from '@common/utils/upload-safety.util';
import { CapabilitiesService } from '../../capabilities/capabilities.service';
import { cleanupUploadedFile, MAX_RESOURCE_SIZE, resourceUploadInterceptor } from '../resources.controller';
import { ResourcePreviewService } from '../resource-preview.service';
import { ResourceV2ExportMapDto, ResourceV2ExportSchematicDto } from './resources-v2-write.dto';

const EDITOR_FILE_LIMIT = 20 * 1024 * 1024;

@ApiV1()
@ApiTags('v1-editor-tools')
@Controller('v1/editor-tools')
export class EditorToolsController {
  constructor(
    private readonly previews: ResourcePreviewService,
    private readonly capabilities: CapabilitiesService,
  ) {}

  @Get('status')
  @OAuthOptionalProtected('resource.read')
  @ApiOperation({ operationId: 'getEditorToolStatus', summary: '读取在线地图与蓝图编辑器的实际可用状态' })
  @ApiOkResponse({ description: 'Renderer runtime, editor operations and ResourceStorage readiness for the tool center.' })
  getStatus() { return this.capabilities.getEditorToolStatus(); }

  @Get('content-catalog')
  @OAuthOptionalProtected('resource.read')
  @ApiOperation({ operationId: 'getMindustryEditorContentCatalog', summary: '读取固定 Mindustry 运行时生成的可编辑内容目录' })
  @ApiOkResponse({ description: 'Vanilla blocks, floors, items, liquids, units, status effects and teams with localized names and available icons.' })
  getContentCatalog() { return this.previews.resolveContentCatalog(); }

  @Post(':kind/create')
  @RawHttpResponse()
  @OAuthOptionalProtected('resource.read')
  @RateLimit({ max: 20, window: 60 })
  @ApiParam({ name: 'kind', enum: ['schematic', 'map'] })
  @ApiOperation({ operationId: 'createStandaloneMindustryEditorFile', summary: '通过官方 Mindustry 写入器创建空白蓝图或地图' })
  @ApiBody({ schema: { type: 'object', required: ['width', 'height', 'name'], properties: {
    width: { type: 'integer', minimum: 1, maximum: 2000 }, height: { type: 'integer', minimum: 1, maximum: 2000 }, name: { type: 'string', maxLength: 120 },
    floor: { type: 'string', maxLength: 191, description: 'Renderer-validated vanilla floor internal name.' },
    template: { type: 'string', enum: ['survival', 'sandbox', 'attack', 'pvp', 'custom'] },
  } } })
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ description: 'Official Mindustry .msch or .msav bytes.', content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } })
  async createBlank(@Param('kind') kindName: string, @Body() body: Record<string, unknown>, @Res() response: Response) {
    if (kindName !== 'map' && kindName !== 'schematic') throw new BadRequestException('编辑器文件类型无效');
    const kind = kindName as 'map' | 'schematic';
    await this.assertEditorEnabled(kind);
    if (!Number.isInteger(body?.width) || !Number.isInteger(body?.height) || typeof body?.name !== 'string') {
      throw new BadRequestException('请填写有效的文件名称和尺寸');
    }
    const result = await this.previews.createBlankEditorFile(kind, Number(body.width), Number(body.height), body.name,
      typeof body.floor === 'string' ? body.floor : 'stone', typeof body.template === 'string' ? body.template : 'survival');
    const extension = kind === 'map' ? '.msav' : '.msch';
    const stem = body.name.trim().replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'mindustry-file';
    response.setHeader('Content-Type', 'application/octet-stream');
    response.setHeader('Content-Disposition', attachmentContentDisposition(`${stem}${extension}`));
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Content-SHA256', result.sha256);
    return response.send(result.data);
  }

  @Post(':kind/analyze')
  @OAuthOptionalProtected('resource.read')
  @UseInterceptors(resourceUploadInterceptor)
  @RateLimit({ max: 20, window: 60 })
  @ApiParam({ name: 'kind', enum: ['schematic', 'map'] })
  @ApiOperation({ operationId: 'analyzeEditorSourceFile', summary: '安全分析普通在线编辑器上传的本地地图或蓝图文件', description: '不创建 Resource、版本或 RES binding。文件只交给固定 Mindustry Renderer 读取。' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOkResponse({ description: 'Bounded official renderer metadata used to populate the standalone editor.' })
  async analyze(@Param('kind') kindName: string, @UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('请选择 .msch 或 .msav 文件');
    try {
      await assertSafeUploadedFile(file, MAX_RESOURCE_SIZE);
      if (file.size > EDITOR_FILE_LIMIT) throw new BadRequestException('文件超过 20 MiB 在线编辑上限');
      const kind = this.kindFromRequest(file.originalname);
      if (kindName !== kind) throw new BadRequestException('文件类型与当前编辑器不匹配');
      await this.assertEditorEnabled(kind);
      const bytes = await readFile(file.path);
      return await this.previews.analyzeEditorFile(kind, file.originalname, bytes);
    } finally {
      await cleanupUploadedFile(file);
    }
  }

  @Post('schematic/export')
  @RawHttpResponse()
  @OAuthOptionalProtected('resource.read')
  @UseInterceptors(resourceUploadInterceptor)
  @RateLimit({ max: 20, window: 60 })
  @ApiOperation({ operationId: 'exportStandaloneSchematicEdit', summary: '通过官方 Schematics 读写导出本地蓝图编辑结果', description: '不要求 Resource 管理权限；未知内容、Mod 内容和不安全配置仍失败关闭。' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file', 'operations'], properties: {
    file: { type: 'string', format: 'binary' }, operations: { type: 'string', description: 'ResourceV2ExportSchematicDto JSON' },
  } } })
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ description: 'Official Mindustry .msch bytes.', content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } })
  async exportSchematic(@Body() body: Record<string, unknown>, @UploadedFile() file: Express.Multer.File | undefined, @Res() response: Response) {
    if (!file) throw new BadRequestException('请选择蓝图文件');
    try {
      await assertSafeUploadedFile(file, MAX_RESOURCE_SIZE);
      if (file.size > EDITOR_FILE_LIMIT) throw new BadRequestException('文件超过 20 MiB 在线编辑上限');
      await this.assertEditorEnabled('schematic');
      const operations = await this.parseOperations(body?.operations, ResourceV2ExportSchematicDto);
      const result = await this.previews.transformSchematic(file.originalname, await readFile(file.path), operations as any);
      response.setHeader('Content-Type', 'application/octet-stream');
      response.setHeader('Content-Disposition', attachmentContentDisposition(this.editedName(file.originalname, '.msch')));
      response.setHeader('Cache-Control', 'private, no-store');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('X-Content-SHA256', result.sha256);
      return response.send(result.data);
    } finally {
      await cleanupUploadedFile(file);
    }
  }

  @Post('map/export')
  @RawHttpResponse()
  @OAuthOptionalProtected('resource.read')
  @UseInterceptors(resourceUploadInterceptor)
  @RateLimit({ max: 20, window: 60 })
  @ApiOperation({ operationId: 'exportStandaloneMapEdit', summary: '通过官方 MapIO 读写导出本地地图编辑结果', description: '不要求 Resource 管理权限；地图内容、对象、规则和波次继续经过 Renderer 安全校验。' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file', 'operations'], properties: {
    file: { type: 'string', format: 'binary' }, operations: { type: 'string', description: 'ResourceV2ExportMapDto JSON' },
  } } })
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ description: 'Official Mindustry .msav bytes.', content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } })
  async exportMap(@Body() body: Record<string, unknown>, @UploadedFile() file: Express.Multer.File | undefined, @Res() response: Response) {
    if (!file) throw new BadRequestException('请选择地图文件');
    try {
      await assertSafeUploadedFile(file, MAX_RESOURCE_SIZE);
      if (file.size > EDITOR_FILE_LIMIT) throw new BadRequestException('文件超过 20 MiB 在线编辑上限');
      await this.assertEditorEnabled('map');
      const operations = await this.parseOperations(body?.operations, ResourceV2ExportMapDto);
      const result = await this.previews.transformMap(file.originalname, await readFile(file.path), operations as any);
      response.setHeader('Content-Type', 'application/octet-stream');
      response.setHeader('Content-Disposition', attachmentContentDisposition(this.editedName(file.originalname, '.msav')));
      response.setHeader('Cache-Control', 'private, no-store');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('X-Content-SHA256', result.sha256);
      return response.send(result.data);
    } finally {
      await cleanupUploadedFile(file);
    }
  }

  private kindFromRequest(fileName: string): 'map' | 'schematic' {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.msch')) return 'schematic';
    if (lower.endsWith('.msav')) return 'map';
    throw new BadRequestException('仅支持 .msch 蓝图或 .msav 地图');
  }

  private async assertEditorEnabled(kind: 'map' | 'schematic'): Promise<void> {
    const status = await this.capabilities.getEditorToolStatus();
    const enabled = kind === 'map' ? status.map.enabled : status.schematic.enabled;
    if (enabled) return;
    const reason = kind === 'map' ? status.map.reason : status.schematic.reason;
    const message = reason === 'resource_upload_disabled' ? '站点暂时关闭了在线编辑功能'
        : reason === 'resource_center_unavailable' ? '资源中心暂不可用，在线编辑器已暂停'
          : 'Mindustry Renderer 尚未就绪，在线编辑器暂不可用';
    throw new ServiceUnavailableException(message);
  }

  private editedName(fileName: string, extension: '.msch' | '.msav'): string {
    const stem = fileName.split(/[\\/]/).pop()?.replace(/\.(msch|msav)$/i, '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'mindustry-file';
    return `${stem}-edited${extension}`;
  }

  private async parseOperations<T>(value: unknown, type: new (...args: any[]) => T): Promise<T> {
    if (typeof value !== 'string' || value.length > 1024 * 1024) throw new BadRequestException('编辑数据无效');
    let parsed: unknown;
    try { parsed = JSON.parse(value); } catch { throw new BadRequestException('编辑数据格式无效'); }
    return new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
      .transform(parsed, { type: 'body', metatype: type }) as Promise<T>;
  }
}
