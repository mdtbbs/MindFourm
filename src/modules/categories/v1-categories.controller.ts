import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '../../common/decorators/api-v1.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CategoriesService } from './categories.service';

const PUBLIC_CATEGORY_SCHEMA: any = {
  type: 'object',
  required: ['id', 'name', 'slug', 'sort_order', 'is_active', 'description', 'color', 'icon', 'group_key', 'parent_id', 'show_in_sidebar', 'created_at', 'post_count'],
  properties: {
    id: { type: 'integer', example: 2, description: '分类 ID。' },
    name: { type: 'string', example: '交流', description: '分类显示名称。' },
    slug: { type: 'string', example: 'discussion', description: '分类 URL 标识。' },
    sort_order: { type: 'integer', example: 10, description: '导航显示顺序。' },
    is_active: { type: 'boolean', example: true, description: '分类是否启用。' },
    description: { type: 'string', nullable: true, example: null, description: '分类说明。' },
    color: { type: 'string', nullable: true, example: '#336699', description: '主题色。' },
    icon: { type: 'string', nullable: true, example: 'chat', description: '图标标识。' },
    group_key: { type: 'string', nullable: true, example: 'community', description: '导航分组标识。' },
    parent_id: { type: 'integer', nullable: true, example: null, description: '父分类 ID；顶级分类为 null。' },
    show_in_sidebar: { type: 'boolean', example: true, description: '是否显示在侧边导航。' },
    created_at: { type: 'string', format: 'date-time', example: '2024-01-01T00:00:00.000Z', description: '分类创建时间。' },
    post_count: { type: 'integer', example: 120, description: '分类下的帖子数。' },
  },
};

@ApiV1()
@ApiTags('v1-categories')
@Public()
@Controller('v1/categories')
export class CategoriesV1Controller {
  constructor(private readonly categories: CategoriesService) {}
  @Get()
  @ApiOkResponse({ description: '可用于论坛分类导航的公开分类列表。', schema: { type: 'array', items: PUBLIC_CATEGORY_SCHEMA } })
  list() { return this.categories.getAll(false); }

  @Get(':id')
  @ApiOkResponse({ description: '指定分类的公开字段和帖子数。', schema: PUBLIC_CATEGORY_SCHEMA })
  getById(@Param('id', ParseIntPipe) id: number) { return this.categories.getById(id); }
}
