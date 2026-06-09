import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tag } from '../../entities/tag.entity';
import { Post } from '../../entities/post.entity';
import { PostTag } from '../../entities/post-tag.entity';

@Injectable()
export class TagsService {
  constructor(
    @InjectRepository(Tag)
    private readonly tagRepository: Repository<Tag>,
    @InjectRepository(Post)
    private readonly postRepository: Repository<Post>,
    @InjectRepository(PostTag)
    private readonly postTagRepository: Repository<PostTag>,
  ) {}

  async getAll() {
    const tags = await this.tagRepository
      .createQueryBuilder('tag')
      .leftJoin('tag.postTags', 'post_tag')
      .addSelect('COUNT(post_tag.post_id)', 'post_count')
      .groupBy('tag.id')
      .orderBy('tag.created_at', 'DESC')
      .getRawMany();

    return tags.map((row) => ({
      id: row.tag_id,
      name: row.tag_name,
      slug: row.tag_slug,
      created_at: row.tag_created_at,
      post_count: parseInt(row.post_count, 10),
    }));
  }

  async getBySlug(slug: string) {
    const tag = await this.tagRepository.findOne({
      where: { slug },
    });

    if (!tag) {
      throw new NotFoundException(`Tag with slug "${slug}" not found`);
    }

    return tag;
  }

  async getOrCreate(name: string) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    let tag = await this.tagRepository.findOne({
      where: { slug },
    });

    if (!tag) {
      tag = this.tagRepository.create({
        name,
        slug,
      });
      tag = await this.tagRepository.save(tag);
    }

    return tag;
  }

  async attachTags(postId: number, tagNames: string[]) {
    const tags = await Promise.all(
      tagNames.map((name) => this.getOrCreate(name)),
    );

    for (const tag of tags) {
      await this.postTagRepository.query(
        'INSERT IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)',
        [postId, tag.id],
      );
    }

    return tags;
  }

  async batchAttach(postId: number, tagIds: number[]) {
    for (const tagId of tagIds) {
      await this.postTagRepository.query(
        'INSERT IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)',
        [postId, tagId],
      );
    }
  }

  async detachTags(postId: number) {
    await this.postTagRepository.delete({ post: { id: postId } });
  }

  async getPostTags(postId: number) {
    const postTags = await this.postTagRepository.find({
      where: { post: { id: postId } },
      relations: ['tag'],
    });

    return postTags.map((pt) => pt.tag);
  }

  async getPostTagsForMultiplePosts(postIds: number[]) {
    const postTags = await this.postTagRepository.find({
      where: postIds.map((id) => ({ post: { id } })),
      relations: ['tag'],
    });

    const result: Record<number, Tag[]> = {};
    for (const postId of postIds) {
      result[postId] = postTags
        .filter((pt) => pt.post.id === postId)
        .map((pt) => pt.tag);
    }

    return result;
  }

  async getPostsByTagSlug(slug: string, page: number, limit: number) {
    const tag = await this.getBySlug(slug);

    const [posts, total] = await this.postRepository
      .createQueryBuilder('post')
      .innerJoin('post.postTags', 'post_tag')
      .innerJoin('post_tag.tag', 'tag')
      .where('tag.id = :tagId', { tagId: tag.id })
      .skip((page - 1) * limit)
      .take(limit)
      .orderBy('post.created_at', 'DESC')
      .getManyAndCount();

    return {
      posts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findAll(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [data, total] = await this.tagRepository.findAndCount({
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async create(dto: { name: string; slug?: string }) {
    const slug = dto.slug || dto.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const tag = this.tagRepository.create({
      name: dto.name,
      slug,
    });

    const saved = await this.tagRepository.save(tag);
    return saved;
  }

  async update(id: number, dto: { name?: string; slug?: string }) {
    const tag = await this.tagRepository.findOne({
      where: { id },
    });

    if (!tag) {
      throw new NotFoundException(`Tag with ID ${id} not found`);
    }

    if (dto.name !== undefined) {
      tag.name = dto.name;
    }
    if (dto.slug !== undefined) {
      tag.slug = dto.slug;
    }

    return await this.tagRepository.save(tag);
  }

  async delete(id: number) {
    const tag = await this.tagRepository.findOne({
      where: { id },
    });

    if (!tag) {
      throw new NotFoundException(`Tag with ID ${id} not found`);
    }

    await this.tagRepository.remove(tag);
    return { message: 'Tag deleted successfully' };
  }
}
