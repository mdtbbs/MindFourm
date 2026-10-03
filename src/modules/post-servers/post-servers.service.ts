import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from '@entities/post.entity';
import { User } from '@entities/user.entity';
import { ContentRelation } from '@entities/content-relation.entity';
import { applyPublicPostVisibility } from '@common/utils/post-visibility.util';

@Injectable()
export class PostServersService {
  constructor(
    @InjectRepository(Post)
    private postRepo: Repository<Post>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(ContentRelation)
    private relationRepo: Repository<ContentRelation>,
  ) {}

  async getPostsByServer(serverId: number) {
    const relations = await this.relationRepo.find({
      where: { source_type: 'post', target_type: 'game_server', target_id: String(serverId), relation_type: 'related' },
      select: ['source_id'],
    });
    if (relations.length === 0) return [];
    const query = this.postRepo.createQueryBuilder('post')
      .leftJoinAndSelect('post.user', 'user')
      .leftJoinAndSelect('post.category', 'category')
      .where('post.id IN (:...postIds)', { postIds: relations.map((relation) => relation.source_id) });
    applyPublicPostVisibility(query, 'post');
    return query.orderBy('post.created_at', 'DESC').getMany();
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

    // Replace any previous server association through the generic relation table.
    await this.relationRepo.delete({ source_type: 'post', source_id: postId, target_type: 'game_server', relation_type: 'related' });
    await this.relationRepo.save(this.relationRepo.create({
      source_type: 'post', source_id: postId, target_type: 'game_server', target_id: String(serverId), relation_type: 'related',
    }));

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

    await this.relationRepo.delete({ source_type: 'post', source_id: postId, target_type: 'game_server', relation_type: 'related' });

    return { success: true, post_id: postId };
  }
}
