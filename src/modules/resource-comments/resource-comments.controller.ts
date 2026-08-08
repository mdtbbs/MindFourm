import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { ResourceCommentsService } from './resource-comments.service';
import { CreateResourceCommentDto } from './dto/create-resource-comment.dto';
import { UpdateResourceCommentDto } from './dto/update-resource-comment.dto';
import { Public } from '@common/decorators/public.decorator';

@Controller()
export class ResourceCommentsController {
  constructor(private readonly service: ResourceCommentsService) {}

  @Get('resources/:id/comments')
  @Public()
  async getComments(
    @Param('id') resourceId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.service.findByResource(
      parseInt(resourceId),
      parseInt(page),
      parseInt(limit),
    );
  }

  @Post('resources/:id/comments')
  @UseGuards(JwtAuthGuard)
  async createComment(
    @Param('id') resourceId: string,
    @Body() dto: CreateResourceCommentDto,
    @Request() req,
  ) {
    return this.service.create(parseInt(resourceId), req.user.id, dto);
  }

  @Put('resource-comments/:id')
  @UseGuards(JwtAuthGuard)
  async updateComment(
    @Param('id') id: string,
    @Body() dto: UpdateResourceCommentDto,
    @Request() req,
  ) {
    return this.service.update(parseInt(id), req.user.id, dto);
  }

  @Delete('resource-comments/:id')
  @UseGuards(JwtAuthGuard)
  async deleteComment(@Param('id') id: string, @Request() req) {
    return this.service.delete(
      parseInt(id),
      req.user.id,
      req.user.role,
    );
  }

  @Post('resource-comments/:id/like')
  @UseGuards(JwtAuthGuard)
  async likeComment(@Param('id') id: string) {
    await this.service.incrementLike(parseInt(id));
    return { success: true };
  }

  @Delete('resource-comments/:id/like')
  @UseGuards(JwtAuthGuard)
  async unlikeComment(@Param('id') id: string) {
    await this.service.decrementLike(parseInt(id));
    return { success: true };
  }
}
