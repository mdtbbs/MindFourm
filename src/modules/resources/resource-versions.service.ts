import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ResourceVersion } from '@entities/resource-version.entity';
import { Resource } from '@entities/resource.entity';

@Injectable()
export class ResourceVersionService {
  constructor(
    @InjectRepository(ResourceVersion)
    private versionRepository: Repository<ResourceVersion>,
    @InjectRepository(Resource)
    private resourceRepository: Repository<Resource>,
    private dataSource: DataSource,
  ) {}

  /**
   * List versions for a resource
   */
  async list(resourceId: number): Promise<ResourceVersion[]> {
    // Verify resource exists
    const resource = await this.resourceRepository.findOne({
      where: { id: resourceId },
    });

    if (!resource) {
      throw new NotFoundException('资源不存在');
    }

    return this.versionRepository.find({
      where: { resource_id: resourceId },
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Create a new version
   */
  async create(dto: { resource_id: number; version: string; file_path: string }): Promise<ResourceVersion> {
    // Verify resource exists
    const resource = await this.resourceRepository.findOne({
      where: { id: dto.resource_id },
    });

    if (!resource) {
      throw new NotFoundException('资源不存在');
    }

    const version = this.versionRepository.create(dto);
    return this.versionRepository.save(version);
  }

  /**
   * Delete a version
   */
  async delete(id: number, resourceId: number): Promise<void> {
    const version = await this.versionRepository.findOne({
      where: { id, resource_id: resourceId },
    });

    if (!version) {
      throw new NotFoundException('版本不存在');
    }

    await this.versionRepository.delete(id);
  }
}
