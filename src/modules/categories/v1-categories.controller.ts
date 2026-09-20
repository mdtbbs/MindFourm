import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '../../common/decorators/api-v1.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CategoriesService } from './categories.service';

@ApiV1()
@ApiTags('v1-categories')
@Public()
@Controller('v1/categories')
export class CategoriesV1Controller {
  constructor(private readonly categories: CategoriesService) {}
  @Get() list() { return this.categories.getAll(false); }
  @Get(':id') getById(@Param('id', ParseIntPipe) id: number) { return this.categories.getById(id); }
}
