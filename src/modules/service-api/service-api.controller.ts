import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '@entities/user.entity';
import { PostsService } from '../posts/posts.service';
import { RepliesService } from '../replies/replies.service';
import { ForumApiKeyGuard } from '../../common/guards/forum-api-key.guard';
import { SkipPhoneVerification } from '../../common/decorators/skip-phone-verification.decorator';
import { ServiceAccountSelectorDto } from './dto/service-account-selector.dto';
import { ServiceCreatePostDto } from './dto/service-create-post.dto';
import { ServiceCreateReplyDto } from './dto/service-create-reply.dto';

@Controller('service-api')
@SkipPhoneVerification()
@UseGuards(ForumApiKeyGuard)
export class ServiceApiController {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private postsService: PostsService,
    private repliesService: RepliesService,
  ) {}

  @Post('posts')
  async createPost(@Body() body: ServiceCreatePostDto) {
    const user = await this.resolveWritableUser(body);
    const post = await this.postsService.create({
      title: body.title,
      content: body.content,
      category_id: body.category_id,
      server_id: body.server_id,
      required_group_id: body.required_group_id,
      post_type: body.post_type,
      tags: body.tags,
      status: body.status,
    }, user.id);

    return {
      success: true,
      user_id: user.id,
      post_id: post?.id ?? null,
      status: post?.status ?? null,
      post,
    };
  }

  @Post('posts/:postId/replies')
  async createReply(
    @Param('postId', ParseIntPipe) postId: number,
    @Body() body: ServiceCreateReplyDto,
  ) {
    const user = await this.resolveWritableUser(body);
    const reply = await this.repliesService.createReplyForPost(postId, {
      content: body.content,
      parent_reply_id: body.parent_reply_id,
    }, user.id);

    return {
      success: true,
      user_id: user.id,
      post_id: postId,
      reply_id: reply.id,
      status: reply.status,
      reply,
    };
  }

  private async resolveWritableUser(selector: ServiceAccountSelectorDto): Promise<User> {
    const selectors = [
      selector.user_id !== undefined,
      selector.mindauth_id !== undefined,
      selector.username !== undefined && selector.username.trim() !== '',
    ].filter(Boolean);

    if (selectors.length !== 1) {
      throw new BadRequestException('必须且只能提供 user_id、mindauth_id、username 其中一个账号标识');
    }

    let where: { id: number } | { mindauth_id: number } | { username: string };
    if (selector.user_id !== undefined) {
      where = { id: selector.user_id };
    } else if (selector.mindauth_id !== undefined) {
      where = { mindauth_id: selector.mindauth_id };
    } else {
      where = { username: selector.username!.trim() };
    }

    const user = await this.userRepository.findOne({ where });
    if (!user) {
      throw new NotFoundException('指定账号不存在');
    }

    if (!user.phone_verified) {
      throw new ForbiddenException({
        code: 'PHONE_NOT_VERIFIED',
        message: '指定账号未验证手机号，不能执行写操作',
      });
    }

    return user;
  }
}
