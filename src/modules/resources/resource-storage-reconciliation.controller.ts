import { BadRequestException, Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { ResourceStorageReconciliationDto } from './dto/resource-storage-reconciliation.dto';
import { ResourceStorageReconciliationService } from './resource-storage-reconciliation.service';

@ApiTags('resource-storage-reconciliation')
@Controller('admin/resources/storage')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class ResourceStorageReconciliationController {
  constructor(private readonly reconciliation: ResourceStorageReconciliationService) {}

  @Post('reconciliation/scan')
  @ApiBody({ type: ResourceStorageReconciliationDto })
  async scan(@Body() dto: ResourceStorageReconciliationDto, @Req() request: any) {
    if (dto.repair === true && dto.confirm !== true) {
      throw new BadRequestException({ code: 'RESOURCE_STORAGE_REPAIR_CONFIRM_REQUIRED', message: '修复资源存储对账问题必须同时提供 confirm=true' });
    }
    return this.reconciliation.scan(dto, Number(request.user?.id));
  }
}
