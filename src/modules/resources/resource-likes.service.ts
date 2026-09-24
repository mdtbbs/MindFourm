import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResourceLike } from '@entities/resource-like.entity';
import { ResourcesService } from './resources.service';

@Injectable()
export class ResourceLikesService {
  constructor(
    @InjectRepository(ResourceLike)
    private readonly likeRepository: Repository<ResourceLike>,
    private readonly resourcesService: ResourcesService,
  ) {}

  async getStatus(resourceId: number, userId: number) {
    await this.resourcesService.getById(resourceId, { id: userId, role: 'user' });
    const [like, count] = await Promise.all([
      this.likeRepository.findOne({ where: { resource_id: resourceId, user_id: userId } }),
      this.likeRepository.count({ where: { resource_id: resourceId } }),
    ]);
    return { is_liked: Boolean(like), like_count: count };
  }

  async add(resourceId: number, userId: number) {
    const resource = await this.resourcesService.getById(resourceId, { id: userId, role: 'user' });
    if (!resource) throw new NotFoundException('资源不存在');
    const existing = await this.likeRepository.findOne({ where: { resource_id: resourceId, user_id: userId } });
    if (!existing) {
      try {
        await this.likeRepository.save(this.likeRepository.create({ resource_id: resourceId, user_id: userId }));
      } catch (error: any) {
        // The unique (user_id, resource_id) key makes concurrent retries
        // idempotent as well as sequential ones.
        if (!['ER_DUP_ENTRY', '23505'].includes(error?.code)) throw error;
      }
    }
    return { is_liked: true, like_count: await this.likeRepository.count({ where: { resource_id: resourceId } }) };
  }

  async remove(resourceId: number, userId: number) {
    await this.resourcesService.getById(resourceId, { id: userId, role: 'user' });
    await this.likeRepository.delete({ resource_id: resourceId, user_id: userId });
    return { is_liked: false, like_count: await this.likeRepository.count({ where: { resource_id: resourceId } }) };
  }
}
