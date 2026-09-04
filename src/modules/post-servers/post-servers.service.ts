import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from '@entities/post.entity';
import { User } from '@entities/user.entity';

@Injectable()
export class PostServersService {
  constructor(
    @InjectRepository(Post)
    private postRepo: Repository<Post>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  async getPostsByServer(serverId: number) {
    return this.postRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.user', 'u')
      .leftJoinAndSelect('p.category', 'c')
      .where('p.server_id = :serverId', { serverId })
      .andWhere('p.status = :status', { status: 'published' })
      .orderBy('p.created_at', 'DESC')
      .getMany();
  }

  async getForumPostsByServer(serverId: number) {
    const posts = await this.getPostsByServer(serverId);
    return posts.map((p) => ({
      id: p.id,
      title: p.title,
      post_type: p.post_type,
      status: p.status,
      created_at: p.created_at,
      user: { username: p.user?.username },
      category: { name: p.category?.name, slug: p.category?.slug },
    }));
  }

  async linkPostToServer(postId: number, serverId: number, userId: number) {
    // 1. Find the post
    const post = await this.postRepo.findOne({ where: { id: postId } });
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    // 2. Verify user owns the post
    if (post.user_id !== userId) {
      throw new ForbiddenException('You can only link your own posts');
    }

    // 3. Update server_id
    post.server_id = serverId;
    await this.postRepo.save(post);

    return { success: true, post_id: postId, server_id: serverId };
  }

  async unlinkPostFromServer(postId: number, userId: number) {
    // 1. Find the post
    const post = await this.postRepo.findOne({ where: { id: postId } });
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    // 2. Verify user owns the post
    if (post.user_id !== userId) {
      throw new ForbiddenException('You can only unlink your own posts');
    }

    // 3. Clear server_id
    post.server_id = undefined as any;
    await this.postRepo.save(post);

    return { success: true, post_id: postId };
  }
}
