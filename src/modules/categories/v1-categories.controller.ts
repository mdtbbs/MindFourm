import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '../../common/decorators/api-v1.decorator';
import { CategoriesService } from './categories.service';

@ApiV1()
@ApiTags('v1-categories')
@Controller('v1/categories')
export class CategoriesV1Controller {
  constructor(private readonly categories: CategoriesService) {}
  @Get() list() { return this.categories.getAll(false); }
}
