import { Controller, Get, Param } from '@nestjs/common';
import { CategoriesService } from './categories.service';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  async getAll() {
    return this.categoriesService.getAll(false);
  }

  @Get(':id')
  async getById(@Param('id') id: number) {
    return this.categoriesService.getById(id);
  }
}
