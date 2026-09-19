import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResourceVersion } from '@entities/resource-version.entity';
import { Resource } from '@entities/resource.entity';
import { ResourceFile } from '@entities/resource-file.entity';
import { ResourceFileMeta } from './resources.service';
import { parseMarkdown } from '@common/utils/markdown.util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';

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
      throw new NotFoundException('资源不存在');
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
      throw new BadRequestException('版本号不能为空');
    }

    if (!file) {
      throw new BadRequestException('版本必须包含文件');
    }

    const resource = await this.resourceRepository.findOne({
      where: { id: dto.resource_id },
    });

    if (!resource) {
      throw new NotFoundException('资源不存在');
    }

    if (resource.user_id !== userId) {
      throw new ForbiddenException('没有权限为此资源添加版本');
    }

    const existing = await this.versionRepository.findOne({
      where: { resource_id: dto.resource_id, version: dto.version.trim() },
    });

    if (existing) {
      throw new BadRequestException('该版本已存在');
    }

    const content = dto.content?.trim() || undefined;
    const version = this.versionRepository.create({
      resource_id: dto.resource_id,
      public_id: randomUUID(),
      version: dto.version.trim(),
      status: 'pending_review',
      release_channel: 'stable',
      created_by_user_id: userId,
      release_notes_markdown: content || null,
      release_notes_html: content ? parseMarkdown(content) : null,
      file_path: file.file_path,
      file_name: file.file_name,
      file_size: file.file_size,
      mime_type: file.mime_type,
      content_hash: file.content_hash,
      content,
      content_html: content ? parseMarkdown(content) : undefined,
    });

    const saved = await this.versionRepository.save(version);
    await this.versionRepository.manager.save(ResourceFile, {
      public_id: randomUUID(),
      resource_version_id: saved.id,
      role: 'primary',
      delivery_mode: 'managed',
      original_filename: file.file_name,
      mime_type: file.mime_type,
      size_bytes: file.file_size,
      hash_algorithm: 'sha256',
      content_hash: file.content_hash,
      integrity_status: 'verified',
      storage_backend: 'local',
      storage_key: file.file_path,
      external_url: null,
      availability_status: 'available',
      sort_order: 0,
    });
    // Any new binary changes the reviewed release surface. Keep the whole
    // resource unavailable until staff approves this version again.
    if (resource.status === 'approved') {
      await this.resourceRepository.update(resource.id, { status: 'pending' });
    }
    return this.normalizeVersion(saved);
  }

  async getDownloadTarget(resourceId: number, versionId: number): Promise<ResourceVersion> {
    const version = await this.versionRepository.findOne({
      where: { id: versionId, resource_id: resourceId },
    });

    if (!version) {
      throw new NotFoundException('版本不存在');
    }

    return version;
  }

  async delete(id: number, resourceId: number, userId: number): Promise<void> {
    const resource = await this.resourceRepository.findOne({
      where: { id: resourceId },
    });

    if (!resource) {
      throw new NotFoundException('资源不存在');
    }

    if (resource.user_id !== userId) {
      throw new ForbiddenException('没有权限删除此资源的版本');
    }

    const version = await this.versionRepository.findOne({
      where: { id, resource_id: resourceId },
    });

    if (!version) {
      throw new NotFoundException('版本不存在');
    }

    await this.deleteStoredFile(version.file_path);
    await this.versionRepository.delete(id);
  }
}
