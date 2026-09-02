import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bookmark } from '../../entities/bookmark.entity';
import { Post } from '../../entities/post.entity';
import { User } from '../../entities/user.entity';
import { Category } from '../../entities/category.entity';

@Injectable()
export class BookmarksService {
  constructor(
    @InjectRepository(Bookmark)
    private bookmarkRepository: Repository<Bookmark>,
    @InjectRepository(Post)
    private postRepository: Repository<Post>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
  ) {}

  async add(userId: number, postId: number): Promise<Bookmark> {
    // Check if already bookmarked (duplicate ignore)
    const existing = await this.bookmarkRepository.findOne({
      where: { user_id: userId, post_id: postId },
    });

    if (existing) {
      return existing;
    }

    // Verify post exists
    const post = await this.postRepository.findOne({ where: { id: postId } });
    if (!post) {
      throw new NotFoundException(`Post with id ${postId} not found`);
    }

    const bookmark = this.bookmarkRepository.create({
      user_id: userId,
      post_id: postId,
    });

    return this.bookmarkRepository.save(bookmark);
  }

  async remove(userId: number, postId: number): Promise<void> {
    const result = await this.bookmarkRepository.delete({
      user_id: userId,
      post_id: postId,
    });

    if (result.affected === 0) {
      throw new NotFoundException('Bookmark not found');
    }
  }

  /** Idempotent V1 operation. Legacy DELETE /bookmarks/:id retains its 404 semantics. */
  async ensureRemoved(userId: number, postId: number): Promise<void> {
    const post = await this.postRepository.findOne({ where: { id: postId }, select: ['id'] });
    if (!post) throw new NotFoundException(`Post with id ${postId} not found`);
    await this.bookmarkRepository.delete({ user_id: userId, post_id: postId });
  }

  async check(userId: number, postId: number): Promise<boolean> {
    const count = await this.bookmarkRepository.count({
      where: { user_id: userId, post_id: postId },
    });
    return count > 0;
  }

  async getByUserId(
    userId: number,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ bookmarks: Bookmark[]; total: number }> {
    const [bookmarks, total] = await this.bookmarkRepository.findAndCount({
      where: { user_id: userId },
      relations: ['post', 'post.category', 'post.user'],
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { bookmarks, total };
  }
}
