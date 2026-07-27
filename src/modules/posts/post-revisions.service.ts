import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from '@entities/post.entity';
import { PostRevision } from '@entities/post-revision.entity';
import { User } from '@entities/user.entity';
import { toPublicUser } from '../users/public-user.util';
import { PostActor, isStaffActor } from './post-actor.util';

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * A history entry without its body.
 *
 * The list view only renders "who, when, and what the title was"; shipping every
 * superseded version of the text with it would make the response grow without bound
 * on a heavily edited post.
 */
export interface PostRevisionSummary {
  id: number;
  post_id: number;
  title: string;
  editor: Partial<User> | null;
  created_at: Date;
}

export interface PostRevisionDetail extends PostRevisionSummary {
  content: string;
}

@Injectable()
export class PostRevisionsService {
  constructor(
    @InjectRepository(PostRevision)
    private revisionRepository: Repository<PostRevision>,
    @InjectRepository(Post)
    private postRepository: Repository<Post>,
  ) {}

  async list(
    postId: number,
    viewer: PostActor | undefined,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ data: PostRevisionSummary[]; pagination: Pagination }> {
    await this.assertCanReadHistory(postId, viewer);

    const currentPage = Math.max(1, page);
    const perPage = Math.max(1, limit);

    const [revisions, total] = await this.revisionRepository.findAndCount({
      where: { post_id: postId },
      relations: ['editor'],
      // `content` is deliberately absent from the projection — see PostRevisionSummary.
      select: {
        id: true,
        post_id: true,
        title: true,
        created_at: true,
        editor: { id: true, username: true, avatar_url: true, role: true },
      },
      // Newest first: the interesting question is almost always "what changed last".
      order: { created_at: 'DESC', id: 'DESC' },
      skip: (currentPage - 1) * perPage,
      take: perPage,
    });

    return {
      data: revisions.map((revision) => this.toSummary(revision)),
      pagination: {
        page: currentPage,
        limit: perPage,
        total,
        // The web client's normalizer treats a pagination object with any of the four
        // fields missing as "no data at all", so all four are always present.
        totalPages: Math.max(1, Math.ceil(total / perPage)),
      },
    };
  }

  async get(
    postId: number,
    revisionId: number,
    viewer: PostActor | undefined,
  ): Promise<PostRevisionDetail> {
    await this.assertCanReadHistory(postId, viewer);

    // `post_id` is part of the lookup rather than checked afterwards: without it the
    // permission check above would be for one post while the row returned belonged to
    // another, so any revision id in the forum would be readable by any post's author.
    const revision = await this.revisionRepository.findOne({
      where: { id: revisionId, post_id: postId },
      relations: ['editor'],
    });

    if (!revision) {
      throw new NotFoundException('该版本不存在');
    }

    return {
      ...this.toSummary(revision),
      content: revision.content,
    };
  }

  /**
   * Only the post's author and staff may read its edit history.
   *
   * Stricter than reading the post itself, and deliberately so: a revision preserves
   * text that was edited away, which is exactly where personal information, a
   * mistakenly pasted secret, or content a moderator asked to have removed ends up.
   */
  private async assertCanReadHistory(
    postId: number,
    viewer: PostActor | undefined,
  ): Promise<void> {
    const post = await this.postRepository.findOne({
      where: { id: postId },
      select: { id: true, user_id: true },
    });

    if (!post) {
      throw new NotFoundException('帖子不存在');
    }

    if (!viewer || (post.user_id !== viewer.id && !isStaffActor(viewer))) {
      throw new ForbiddenException('无权限查看此帖子的编辑历史');
    }
  }

  private toSummary(revision: PostRevision): PostRevisionSummary {
    return {
      id: revision.id,
      post_id: revision.post_id,
      title: revision.title,
      // `toPublicUser` strips email and the notification preferences that the relation
      // would otherwise carry out of the API.
      editor: revision.editor ? toPublicUser(revision.editor) : null,
      created_at: revision.created_at,
    };
  }
}
