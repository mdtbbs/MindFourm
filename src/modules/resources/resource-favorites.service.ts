import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResourceFavorite } from '@entities/resource-favorite.entity';
import { ResourcesService } from './resources.service';

@Injectable()
export class ResourceFavoritesService {
  constructor(
    @InjectRepository(ResourceFavorite)
    private readonly favoriteRepository: Repository<ResourceFavorite>,
    private readonly resourcesService: ResourcesService,
  ) {}

  async getStatus(resourceId: number, userId: number) {
    await this.resourcesService.getById(resourceId, { id: userId, role: 'user' });
    const [favorite, count] = await Promise.all([
      this.favoriteRepository.findOne({ where: { resource_id: resourceId, user_id: userId } }),
      this.favoriteRepository.count({ where: { resource_id: resourceId } }),
    ]);
    return { is_favorited: Boolean(favorite), favorite_count: count };
  }

  async add(resourceId: number, userId: number) {
    const resource = await this.resourcesService.getById(resourceId, { id: userId, role: 'user' });
    if (!resource) throw new NotFoundException('资源不存在');
    const existing = await this.favoriteRepository.findOne({ where: { resource_id: resourceId, user_id: userId } });
    if (!existing) {
      await this.favoriteRepository.save(this.favoriteRepository.create({ resource_id: resourceId, user_id: userId }));
    }
    return { is_favorited: true, favorite_count: await this.favoriteRepository.count({ where: { resource_id: resourceId } }) };
  }

  async remove(resourceId: number, userId: number) {
    await this.resourcesService.getById(resourceId, { id: userId, role: 'user' });
    await this.favoriteRepository.delete({ resource_id: resourceId, user_id: userId });
    return { is_favorited: false, favorite_count: await this.favoriteRepository.count({ where: { resource_id: resourceId } }) };
  }

  async count(resourceId: number) {
    return this.favoriteRepository.count({ where: { resource_id: resourceId } });
  }
}
