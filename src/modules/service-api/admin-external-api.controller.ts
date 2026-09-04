import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { ExternalApiKeyService } from './external-api-key.service';
import { ExternalApiAuditService } from './external-api-audit.service';
import {
  CreateExternalApiKeyDto,
  QueryExternalApiAuditDto,
  QueryExternalApiKeysDto,
  UpdateExternalApiKeyDto,
} from './dto/external-api.dto';

@Controller('admin/external-api')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminExternalApiController {
  constructor(
    private externalApiKeyService: ExternalApiKeyService,
    private externalApiAuditService: ExternalApiAuditService,
  ) {}

  @Get('keys')
  async listKeys(@Query() query: QueryExternalApiKeysDto) {
    return this.externalApiKeyService.list(query);
  }

  @Post('keys')
  async createKey(@Body() dto: CreateExternalApiKeyDto, @Req() req: any) {
    const result = await this.externalApiKeyService.create({
      ...dto,
      created_by: req.user?.id ?? null,
    });

    return {
      key: this.externalApiKeyService.toSafeView(result.key),
      plain_key: result.plainKey,
    };
  }

  @Patch('keys/:id')
  async updateKey(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExternalApiKeyDto,
  ) {
    const key = await this.externalApiKeyService.update(id, dto);
    return this.externalApiKeyService.toSafeView(key);
  }

  @Post('keys/:id/rotate')
  async rotateKey(@Param('id', ParseIntPipe) id: number) {
    const result = await this.externalApiKeyService.rotate(id);
    return {
      key: this.externalApiKeyService.toSafeView(result.key),
      plain_key: result.plainKey,
    };
  }

  @Post('keys/:id/enable')
  async enableKey(@Param('id', ParseIntPipe) id: number) {
    const key = await this.externalApiKeyService.setEnabled(id, true);
    return this.externalApiKeyService.toSafeView(key);
  }

  @Post('keys/:id/disable')
  async disableKey(@Param('id', ParseIntPipe) id: number) {
    const key = await this.externalApiKeyService.setEnabled(id, false);
    return this.externalApiKeyService.toSafeView(key);
  }

  @Get('audit-logs')
  async listAuditLogs(@Query() query: QueryExternalApiAuditDto) {
    return this.externalApiAuditService.list(query);
  }
}
