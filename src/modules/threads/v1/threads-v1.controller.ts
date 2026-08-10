import { Controller, Get, Param, ParseIntPipe, Query, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOkResponse, ApiQuery } from '@nestjs/swagger';
import { ApiV1 } from '../../../common/decorators/api-v1.decorator';
import { ApiV1Exception } from '../../../common/exceptions/api-v1.exception';
import { ThreadReadAdapterService, V1ThreadDto } from '../thread-read-adapter.service';

@ApiV1()
@ApiTags('v1-threads')
@Controller('v1/threads')
export class ThreadsV1Controller {
  constructor(private readonly threadAdapter: ThreadReadAdapterService) {}

  @Get()
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiQuery({ name: 'category_id', required: false, type: Number })
  @ApiOkResponse({ description: 'List of threads' })
  async listThreads(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('category_id') categoryId?: string,
  ): Promise<V1ThreadDto[]> {
    return this.threadAdapter.listThreadsV1({
      limit: Math.min(parseInt(limit || '20', 10), 50),
      offset: parseInt(offset || '0', 10),
      categoryId: categoryId ? parseInt(categoryId, 10) : undefined,
    });
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Thread detail' })
  async getThread(@Param('id', new ParseIntPipe()) id: number): Promise<V1ThreadDto> {
    const thread = await this.threadAdapter.getThreadV1(id);
    if (!thread) {
      throw new ApiV1Exception('THREAD_NOT_FOUND', HttpStatus.NOT_FOUND, '讨论不存在或不可见', false);
    }
    return thread;
  }
}
