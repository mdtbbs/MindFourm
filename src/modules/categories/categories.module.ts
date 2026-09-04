import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';
import { CategoriesV1Controller } from './v1-categories.controller';
import { Category } from '../../entities/category.entity';
import { Post } from '../../entities/post.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Category, Post])],
  controllers: [CategoriesController, CategoriesV1Controller],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
