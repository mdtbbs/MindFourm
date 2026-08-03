import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResourceVersion } from '@entities/resource-version.entity';
import { Resource } from '@entities/resource.entity';
import { ResourceFileMeta } from './resources.service';
import { parseMarkdown } from '@common/utils/markdown.util';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class ResourceVersionService {
  constructor(
    @InjectRepository(ResourceVersion)
    private versionRepository: Repository<ResourceVersion>,
    @InjectRepository(Resource)
    private resourceRepository: Repository<Resource>,
  ) {}

  private normalizeVersion(version: ResourceVersion) {
    return {
      ...version,
      file_size: version.file_size || 0,
    };
  }

  private async deleteStoredFile(filePath?: string | null): Promise<void> {
    if (!filePath) return;
    try {
      await fs.unlink(path.resolve(filePath));
    } catch {
      console.warn(`File not found: ${filePath}`);
    }
  }

  async list(resourceId: number): Promise<any[]> {
    const resource = await this.resourceRepository.findOne({
      where: { id: resourceId },
    });

    if (!resource) {
      throw new NotFoundException('Resource does not exist');
    }

    const versions = await this.versionRepository.find({
      where: { resource_id: resourceId },
      order: { created_at: 'DESC' },
    });

    return versions.map((version) => this.normalizeVersion(version));
  }

  async create(
    dto: { resource_id: number; version: string; content?: string },
    file: ResourceFileMeta | undefined,
    userId: number,
  ): Promise<any> {
    if (!dto.version?.trim()) {
      throw new BadRequestException('Version is required');
    }

    if (!file) {
      throw new BadRequestException('A version file is required');
    }

    const resource = await this.resourceRepository.findOne({
      where: { id: dto.resource_id },
    });

    if (!resource) {
      throw new NotFoundException('Resource does not exist');
    }

    if (resource.user_id !== userId) {
      throw new ForbiddenException('No permission to add versions to this resource');
    }

    const existing = await this.versionRepository.findOne({
      where: { resource_id: dto.resource_id, version: dto.version.trim() },
    });

    if (existing) {
      throw new BadRequestException('This version already exists');
    }

    const content = dto.content?.trim() || undefined;
    const version = this.versionRepository.create({
      resource_id: dto.resource_id,
      version: dto.version.trim(),
      file_path: file.file_path,
      file_name: file.file_name,
      file_size: file.file_size,
      mime_type: file.mime_type,
      content,
      content_html: content ? parseMarkdown(content) : undefined,
    });

    return this.normalizeVersion(await this.versionRepository.save(version));
  }

  async getDownloadTarget(resourceId: number, versionId: number): Promise<ResourceVersion> {
    const version = await this.versionRepository.findOne({
      where: { id: versionId, resource_id: resourceId },
    });

    if (!version) {
      throw new NotFoundException('Version does not exist');
    }

    return version;
  }

  async delete(id: number, resourceId: number, userId: number): Promise<void> {
    const resource = await this.resourceRepository.findOne({
      where: { id: resourceId },
    });

    if (!resource) {
      throw new NotFoundException('Resource does not exist');
    }

    if (resource.user_id !== userId) {
      throw new ForbiddenException('No permission to delete versions from this resource');
    }

    const version = await this.versionRepository.findOne({
      where: { id, resource_id: resourceId },
    });

    if (!version) {
      throw new NotFoundException('Version does not exist');
    }

    await this.deleteStoredFile(version.file_path);
    await this.versionRepository.delete(id);
  }
}
