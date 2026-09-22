import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SearchAuditQueryDto } from './dto/search-audit-query.dto';
import { SearchService } from './search.service';

@ApiTags('search-audit')
@Controller('search/audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class SearchAuditController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async list(@Query() query: SearchAuditQueryDto) {
    return this.searchService.getSearchAudits(query.q, query.page, query.limit);
  }
}
