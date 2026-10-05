import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { createReadStream } from 'fs';
import { DataSource, Repository } from 'typeorm';
import { Resource } from '@entities/resource.entity';
import { ResourceVersion } from '@entities/resource-version.entity';
import { ResourceFile } from '@entities/resource-file.entity';
import { ResourceMember } from '@entities/resource-center-v2.entity';
import { ResourceDirectUploadSession } from '@entities/resource-direct-upload-session.entity';
import { ResourceStorageClientError, ResourceStorageClientService } from './resource-storage-client.service';
import { MAX_RESOURCE_SIZE } from './resources.controller';
import type { ResourceFileMeta } from './resources.service';

const ALLOWED_EXTENSIONS = new Set(['.zip', '.rar', '.7z', '.tar', '.gz', '.jar', '.msav', '.msch', '.json', '.hjson', '.txt', '.md', '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif']);
const ALLOWED_ROLES = new Set(['primary', 'supplementary', 'documentation']);

export interface DirectUploadInitInput {
  version_public_id: string;
  filename: string;
  size_bytes: number;
  mime_type: string;
  sha256: string;
  role?: string;
}

@Injectable()
export class ResourceDirectUploadService {
  constructor(
    @InjectRepository(ResourceDirectUploadSession) private readonly sessions: Repository<ResourceDirectUploadSession>,
    @InjectRepository(ResourceVersion) private readonly versions: Repository<ResourceVersion>,
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
    @InjectRepository(ResourceFile) private readonly files: Repository<ResourceFile>,
    private readonly dataSource: DataSource,
    private readonly res: ResourceStorageClientService,
  ) {}

  /** Move a temporary, locally validated upload to RES before durable forum creation. */
  async uploadManagedFile(file: ResourceFileMeta): Promise<ResourceFileMeta> {
    if (file.storage_backend === 'res') return file;
    if (!this.res.isAvailable) throw new ResourceStorageClientError('unavailable');
    const object = await this.res.uploadServerGeneratedObject({
      body: createReadStream(file.file_path), sizeBytes: file.file_size, sha256: file.content_hash,
      mimeType: file.mime_type, filename: file.file_name, purpose: 'resource_version',
    });
    return { ...file, storage_backend: 'res', provider_object_id: object.public_id };
  }

  private async canWriteResource(resource: Resource, actor: { id: number; role?: string }, manager = this.dataSource.manager): Promise<boolean> {
    if (resource.user_id === actor.id || actor.role === 'admin') return true;
    return manager.exists(ResourceMember, { where: [
      { resource_id: resource.id, user_id: actor.id, status: 'active', role: 'maintainer' },
      { resource_id: resource.id, user_id: actor.id, status: 'active', role: 'publisher' },
    ] });
  }

  private validateFile(filename: string, size: number, mime: string, kind: string): void {
    const extension = extname(filename).toLowerCase();
    if (!filename || filename.length > 500 || /[\\/\x00-\x1f]/.test(filename) || !ALLOWED_EXTENSIONS.has(extension)) {
      throw new BadRequestException('资源文件扩展名无效');
    }
    if (kind === 'map' && extension !== '.msav') throw new BadRequestException('地图仅支持 .msav 文件');
    if (kind === 'schematic' && extension !== '.msch') throw new BadRequestException('蓝图仅支持 .msch 文件');
    if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_RESOURCE_SIZE) throw new BadRequestException('上传文件大小无效');
    if (!mime || mime.length > 100 || !/^[\w.+-]+\/[\w.+-]+$/.test(mime)) throw new BadRequestException('文件 MIME 类型无效');
    if (['.msav', '.msch', '.zip', '.jar', '.rar', '.7z', '.tar', '.gz'].includes(extension)
      && !['application/octet-stream', 'application/zip', 'application/x-zip-compressed', 'application/java-archive', 'application/gzip'].includes(mime)) {
      throw new BadRequestException('文件 MIME 类型与扩展名不匹配');
    }
  }

  private async writableVersion(publicId: string, actor: { id: number; role?: string }): Promise<{ version: ResourceVersion; resource: Resource }> {
    const version = await this.versions.findOne({ where: { public_id: publicId } });
    if (!version) throw new NotFoundException('资源版本不存在');
    const resource = await this.resources.findOne({ where: { id: version.resource_id } });
    if (!resource || resource.deleted_at) throw new NotFoundException('资源不存在');
    if (!(await this.canWriteResource(resource, actor))) throw new ForbiddenException('没有权限修改此资源版本');
    if (!['draft', 'pending_review', 'pending'].includes(version.status || '')) {
      throw new ConflictException('资源版本已进入不可修改状态');
    }
    return { version, resource };
  }

  async init(input: DirectUploadInitInput, actor: { id: number; role?: string }) {
    const { version, resource } = await this.writableVersion(input.version_public_id, actor);
    const role = input.role || 'primary';
    if (!ALLOWED_ROLES.has(role)) throw new BadRequestException('无效的文件角色');
    this.validateFile(input.filename, input.size_bytes, input.mime_type, resource.resource_kind || 'other');
    if (!input.sha256 || !/^[a-f0-9]{64}$/i.test(input.sha256)) throw new BadRequestException('必须提供有效的 SHA-256');
    if (role === 'primary' && await this.files.exist({ where: { resource_version_id: version.id, role: 'primary' } })) {
      throw new ConflictException('此版本已有主文件');
    }
    const upload = await this.res.createUploadSession({
      sha256: input.sha256.toLowerCase(), size_bytes: input.size_bytes,
      mime_type: input.mime_type, original_filename: input.filename, purpose: 'resource_version',
    });
    const expiresAt = upload.deduplicated ? new Date(Date.now() + 15 * 60_000) : new Date(upload.upload.expires_at);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) throw new ConflictException('上传会话已失效，请重试');
    const session = await this.sessions.save(this.sessions.create({
      id: randomUUID(), user_id: actor.id, resource_version_id: version.id,
      role, filename: input.filename, size_bytes: input.size_bytes, mime_type: input.mime_type,
      sha256: input.sha256.toLowerCase(),
      object_public_id: upload.deduplicated ? upload.object.public_id : null,
      resource_file_public_id: null, expires_at: expiresAt,
    }));
    return upload.deduplicated
      ? { id: session.id, deduplicated: true, object_id: upload.object.id, object_public_id: upload.object.public_id, complete_required: true }
      : { id: session.id, deduplicated: false, upload: upload.upload, complete_required: true };
  }

  async complete(sessionId: string, objectPublicId: string, actor: { id: number; role?: string }) {
    const session = await this.sessions.findOne({ where: { id: sessionId, user_id: actor.id } });
    if (!session) throw new NotFoundException('上传会话不存在');
    if (session.resource_file_public_id) return { file_public_id: session.resource_file_public_id, completed: true };
    if (session.expires_at.getTime() <= Date.now()) throw new ConflictException('上传会话已过期');
    if (session.object_public_id && session.object_public_id !== objectPublicId) throw new BadRequestException('上传对象不匹配');
    const version = await this.versions.findOne({ where: { id: session.resource_version_id } });
    if (!version?.public_id) throw new NotFoundException('资源版本不存在');
    const { resource } = await this.writableVersion(version.public_id, actor);
    // All integrity and type facts come from RES. The browser supplies only a reference.
    const object = await this.res.getObject(objectPublicId);
    if (object.public_id !== objectPublicId || object.state !== 'verified' || !/^[a-f0-9]{64}$/i.test(object.sha256)) {
      throw new ConflictException('资源存储对象尚未通过验证');
    }
    // CAS dedup retains the first uploader's filename/MIME. Use the authorized
    // filename for display and validate the authoritative bytes' type/size/hash.
    this.validateFile(session.filename, object.size_bytes, object.mime_type, resource.resource_kind || 'other');
    if (object.size_bytes !== Number(session.size_bytes) || object.sha256.toLowerCase() !== session.sha256) {
      throw new BadRequestException('资源存储对象与上传会话不匹配');
    }
    const filePublicId = randomUUID();
    let bindingId: string | undefined;
    try {
      return await this.dataSource.transaction(async (manager) => {
        const locked = await manager.getRepository(ResourceDirectUploadSession).findOne({ where: { id: sessionId, user_id: actor.id }, lock: { mode: 'pessimistic_write' } });
        if (!locked) throw new NotFoundException('上传会话不存在');
        if (locked.resource_file_public_id) return { file_public_id: locked.resource_file_public_id, completed: true };
        if (locked.expires_at.getTime() <= Date.now()) throw new ConflictException('上传会话已过期');
        const latestVersion = await manager.findOne(ResourceVersion, { where: { id: locked.resource_version_id } });
        const latestResource = latestVersion && await manager.findOne(Resource, { where: { id: latestVersion.resource_id }, lock: { mode: 'pessimistic_write' } });
        if (!latestResource || latestResource.deleted_at || !latestVersion || !['draft', 'pending_review', 'pending'].includes(latestVersion.status || '')) throw new ConflictException('资源版本状态已变化');
        if (!(await this.canWriteResource(latestResource, actor, manager))) throw new ForbiddenException('没有权限修改此资源版本');
        if (locked.role === 'primary' && await manager.exists(ResourceFile, { where: { resource_version_id: latestVersion.id, role: 'primary' } })) {
          throw new ConflictException('此版本已有主文件');
        }
        const binding = await this.res.createBinding(objectPublicId, {
          namespace: 'mindforum', owner_type: 'resource_file', owner_id: filePublicId, visibility: 'private',
        });
        bindingId = binding.id;
        await manager.save(ResourceFile, manager.create(ResourceFile, {
          public_id: filePublicId, resource_version_id: latestVersion.id, role: locked.role,
          delivery_mode: 'managed', display_name: locked.filename.slice(0, 255), original_filename: locked.filename,
          mime_type: object.mime_type, size_bytes: object.size_bytes,
          hash_algorithm: 'sha256', content_hash: object.sha256.toLowerCase(), integrity_status: 'verified',
          storage_backend: 'res', storage_key: `sha256:${object.sha256.toLowerCase()}`,
          provider_file_id: null, provider_object_id: object.public_id, provider_binding_id: binding.id,
          external_url: null, availability_status: 'pending', sort_order: 0,
        }));
        await manager.update(ResourceDirectUploadSession, locked.id, { resource_file_public_id: filePublicId, object_public_id: object.public_id });
        return { file_public_id: filePublicId, completed: true };
      });
    } catch (error) {
      if (bindingId) await this.res.deleteBinding(objectPublicId, bindingId).catch(() => undefined);
      throw error;
    }
  }
}
