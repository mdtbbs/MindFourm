import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '../../common/decorators/api-v1.decorator';
import { TagsService } from './tags.service';

@ApiV1()
@ApiTags('v1-tags')
@Controller('v1/tags')
export class TagsV1Controller {
  constructor(private readonly tags: TagsService) {}
  @Get() list() { return this.tags.getAll(); }
}
