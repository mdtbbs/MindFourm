import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '@common/decorators/api-v1.decorator';
import { Public } from '@common/decorators/public.decorator';
import { GameVersionService } from './game-version.service';

const GAME_VERSION_SCHEMA: any = {
  type: 'object',
  required: ['id', 'public_id', 'version_value', 'build', 'channel', 'game_series', 'release_channel', 'display_name', 'released_at', 'is_official', 'is_stable', 'is_latest'],
  properties: {
    id: { type: 'integer', example: 7, description: '数据库内部版本记录 ID。' },
    public_id: { type: 'string', example: 'version-uuid', description: '稳定公开版本标识。' },
    version_value: { type: 'string', example: 'v157', description: 'Mindustry 版本值。' },
    build: { type: 'string', example: '157.1', description: '客户端显示或下载使用的 build 标识。' },
    channel: { type: 'string', example: 'stable', description: '版本通道。' },
    game_series: { type: 'string', example: 'v7', description: '游戏主系列。' },
    release_channel: { type: 'string', example: 'stable', description: '发布通道。' },
    display_name: { type: 'string', nullable: true, example: 'Mindustry v7', description: '可读版本名。' },
    released_at: { type: 'string', format: 'date-time', nullable: true, example: '2026-01-01T00:00:00.000Z', description: '发布时间。' },
    is_official: { type: 'boolean', example: true, description: '是否官方版本。' },
    is_stable: { type: 'boolean', example: true, description: '是否稳定版。' },
    is_latest: { type: 'boolean', example: true, description: '是否标记为该通道最新版。' },
  },
};

@ApiV1()
@ApiTags('v1-game-versions')
@Public()
@Controller('v1/game-versions')
export class GameVersionsController {
  constructor(private readonly versions: GameVersionService) {}

  @Get()
  @ApiQuery({ name: 'channel', required: false, type: String, example: 'stable', description: '按游戏发布通道筛选；不传返回所有通道。' })
  @ApiOkResponse({ description: 'Mindustry 游戏版本列表。', schema: { type: 'array', items: GAME_VERSION_SCHEMA } })
  list(@Query('channel') channel?: string) {
    return this.versions.listVersions(channel);
  }

  @Get('latest')
  @ApiOkResponse({ description: '当前最新官方稳定版；尚未配置时返回 null。', schema: { ...GAME_VERSION_SCHEMA, nullable: true } })
  latestStable() {
    return this.versions.getLatestStable();
  }
}
