import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import { extname } from 'path';
import { createReadStream } from 'fs';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { DataSource, Repository } from 'typeorm';
import { Resource } from '@entities/resource.entity';
import { ResourceVersion } from '@entities/resource-version.entity';
import { ResourceFile } from '@entities/resource-file.entity';
import { ResourceMember } from '@entities/resource-center-v2.entity';
import { ResourceDirectUploadSession } from '@entities/resource-direct-upload-session.entity';
import { ResourceDirectUploadDraft } from '@entities/resource-direct-upload-draft.entity';
import { ResourceStorageClientError, ResourceStorageClientService } from './resource-storage-client.service';
import { MAX_RESOURCE_SIZE } from './resources.controller';
import { ResourceFileMeta, ResourcesService } from './resources.service';
import { validateResourceVersion } from './analyzers/version-constraint.util';
import { parseMarkdown } from '@common/utils/markdown.util';
import { RESOURCE_DIRECT_UPLOAD_DRAFT_TTL_MS } from './resource-direct-upload.constants';
import { ResourcesV2WriteService } from './v2/resources-v2-write.service';

export interface DirectVersionDraftInput {
  version: string;
  version_mode?: 'semver' | 'compatibility';
  release_channel?: 'release' | 'beta' | 'alpha' | 'snapshot';
  game_version_min?: string;
  game_version_max?: string;
  content?: string;
  mod_id?: string;
  mod_author_overrides?: Record<string, unknown>;
}

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
    @InjectRepository(ResourceDirectUploadDraft) private readonly drafts: Repository<ResourceDirectUploadDraft>,
    private readonly v2Writes: ResourcesV2WriteService,
    private readonly resourceLifecycle: ResourcesService,
  ) {}

  private normalizeIdempotencyKey(key: string | undefined): string {
    const value = key?.trim();
    if (!value || !/^[\x21-\x7e]{1,128}$/.test(value)) throw new BadRequestException('Idempotency-Key 格式无效');
    return value;
  }

  private canonical(value: any): any {
    if (Array.isArray(value)) return value.map((item) => this.canonical(item));
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, this.canonical(value[key])]));
    return value;
  }

  async createVersionDraft(publicId: string, input: DirectVersionDraftInput, actor: { id: number; role?: string }, key?: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(publicId)) {
      throw new BadRequestException('Resource public ID must be a UUID');
    }
    const idempotencyKey = this.normalizeIdempotencyKey(key);
    const keyHash = createHash('sha256').update(idempotencyKey).digest('hex');
    const fingerprint = createHash('sha256').update(JSON.stringify(this.canonical({ resource_public_id: publicId, input }))).digest('hex');
    const versionMode = input.version_mode || 'compatibility';
    try { validateResourceVersion(input.version, versionMode); }
    catch (error) { throw new BadRequestException(error instanceof Error ? error.message : '版本号格式无效'); }

    try {
    return await this.dataSource.transaction(async (manager) => {
      const resourceRows = await manager.query(
        'SELECT * FROM resources WHERE public_id=? AND deleted_at IS NULL LIMIT 1 FOR UPDATE', [publicId],
      ) as Resource[];
      const resource = resourceRows[0];
      if (!resource) throw new NotFoundException('资源不存在');
      if (!(await this.canWriteResource(resource, actor, manager))) throw new ForbiddenException('没有权限为此资源添加版本');

      const draftRepo = manager.getRepository(ResourceDirectUploadDraft);
      const existingDraft = await draftRepo.findOne({ where: { user_id: actor.id, idempotency_key_hash: keyHash }, lock: { mode: 'pessimistic_write' } });
      if (existingDraft) {
        if (existingDraft.request_fingerprint !== fingerprint) throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED', message: 'Idempotency-Key 已用于另一份版本草稿。' });
        if (existingDraft.expires_at.getTime() <= Date.now() || existingDraft.status === 'expired') throw new ConflictException({ code: 'UPLOAD_DRAFT_EXPIRED', message: '版本上传草稿已过期，请重新创建。' });
        const previous = await manager.findOne(ResourceVersion, { where: { id: existingDraft.resource_version_id } });
        if (!previous?.public_id) throw new ConflictException('版本上传草稿已失效');
        return {
          resource_public_id: resource.public_id,
          resource_id: resource.id,
          version_public_id: previous.public_id,
          upload_draft_id: existingDraft.id,
          revision: previous.revision,
          expires_at: existingDraft.expires_at.toISOString(),
          draft_status: existingDraft.status,
          version_status: previous.status,
        };
      }

      if (!input.version?.trim() || input.version.trim().length > 50) throw new BadRequestException('版本号无效');
      const releaseNotes = input.content?.trim() || null;
      const revisionRows = await manager.query(
        'SELECT COALESCE(MAX(revision),0) AS max_revision FROM resource_versions WHERE resource_id=? AND version=?',
        [resource.id, input.version.trim()],
      ) as Array<{ max_revision: number | string | null }>;
      const revision = Number(revisionRows[0]?.max_revision || 0) + 1;
      if (!Number.isSafeInteger(revision) || revision < 1) throw new ConflictException('无法分配安全的 ResourceVersion revision');
      const now = Date.now();
      const expiresAt = new Date(now + RESOURCE_DIRECT_UPLOAD_DRAFT_TTL_MS);
      const version = await manager.save(ResourceVersion, manager.create(ResourceVersion, {
        resource_id: resource.id,
        public_id: randomUUID(),
        version: input.version.trim(),
        version_mode: versionMode,
        revision,
        recommended: 0,
        game_version_min: input.game_version_min?.trim() || null,
        game_version_max: input.game_version_max?.trim() || null,
        release_channel: input.release_channel || 'release',
        status: 'upload_pending',
        published_at: null,
        created_by_user_id: actor.id,
        release_notes_markdown: releaseNotes,
        release_notes_html: releaseNotes ? parseMarkdown(releaseNotes) : null,
        content: releaseNotes,
        content_html: releaseNotes ? parseMarkdown(releaseNotes) : null,
      } as Partial<ResourceVersion>));
      const draft = await manager.save(ResourceDirectUploadDraft, manager.create(ResourceDirectUploadDraft, {
        id: randomUUID(), resource_version_id: version.id, user_id: actor.id,
        idempotency_key_hash: keyHash, request_fingerprint: fingerprint,
        request_metadata: input as unknown as Record<string, unknown>,
        status: 'open', expires_at: expiresAt, completed_at: null,
      }));
      return {
        resource_public_id: resource.public_id,
        resource_id: resource.id,
        version_public_id: version.public_id,
        upload_draft_id: draft.id,
        revision,
        expires_at: expiresAt.toISOString(),
        draft_status: draft.status,
        version_status: version.status,
      };
    });
    } catch (error: any) {
      if (error?.code !== 'ER_DUP_ENTRY' && error?.errno !== 1062 && error?.driverError?.code !== 'ER_DUP_ENTRY'
        && error?.driverError?.errno !== 1062) throw error;
      // Concurrent retries using one account-scoped key can race across two
      // Resource locks. Resolve the winner after rollback instead of exposing
      // a database duplicate-key error or creating another version.
      const existingDraft = await this.drafts.findOne({ where: { user_id: actor.id, idempotency_key_hash: keyHash } });
      if (!existingDraft) throw error;
      if (existingDraft.request_fingerprint !== fingerprint) {
        throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED', message: 'Idempotency-Key 已用于另一份版本草稿。' });
      }
      if (existingDraft.expires_at.getTime() <= Date.now() || existingDraft.status === 'expired') {
        throw new ConflictException({ code: 'UPLOAD_DRAFT_EXPIRED', message: '版本上传草稿已过期，请重新创建。' });
      }
      const requestedResource = await this.resources.findOne({ where: { public_id: publicId } });
      if (!requestedResource || requestedResource.deleted_at) throw new NotFoundException('资源不存在');
      if (!(await this.canWriteResource(requestedResource, actor))) throw new ForbiddenException('没有权限为此资源添加版本');
      const previous = await this.versions.findOne({ where: { id: existingDraft.resource_version_id } });
      if (!previous?.public_id || previous.resource_id !== requestedResource.id) throw new ConflictException('版本上传草稿已失效');
      return {
        resource_public_id: requestedResource.public_id,
        resource_id: requestedResource.id,
        version_public_id: previous.public_id,
        upload_draft_id: existingDraft.id,
        revision: previous.revision,
        expires_at: existingDraft.expires_at.toISOString(),
        draft_status: existingDraft.status,
        version_status: previous.status,
      };
    }
  }

  /** Move a temporary, locally validated upload to RES before durable forum creation. */
  async uploadManagedFile(file: ResourceFileMeta): Promise<ResourceFileMeta> {
    if (file.storage_backend === 'res') return file;
    if (!this.res.isReachable) throw new ResourceStorageClientError('unavailable', undefined, this.res.retryAfterSeconds);
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

  private validateFile(filename: string, size: number, mime: string, kind: string, requireModJar = false): void {
    const extension = extname(filename).toLowerCase();
    if (!filename || filename.length > 500 || /[\\/\x00-\x1f]/.test(filename) || !ALLOWED_EXTENSIONS.has(extension)) {
      throw new BadRequestException('资源文件扩展名无效');
    }
    if (kind === 'map' && extension !== '.msav') throw new BadRequestException('地图仅支持 .msav 文件');
    if (kind === 'schematic' && extension !== '.msch') throw new BadRequestException('蓝图仅支持 .msch 文件');
    if (kind === 'mod' && requireModJar && extension !== '.jar') throw new BadRequestException('新 Mod 提交仅支持 .jar 文件');
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
    if (version.status !== 'upload_pending') throw new ConflictException('资源版本没有等待直接上传');
    const draft = await this.drafts.findOne({ where: { resource_version_id: version.id, user_id: actor.id, status: 'open' } });
    if (!draft) throw new ConflictException('版本上传草稿不存在或已完成');
    if (draft.expires_at.getTime() <= Date.now()) {
      await this.drafts.update(draft.id, { status: 'expired' });
      throw new ConflictException('版本上传草稿已过期，请重新创建');
    }
    return { version, resource };
  }

  async init(input: DirectUploadInitInput, actor: { id: number; role?: string }) {
    const { version, resource } = await this.writableVersion(input.version_public_id, actor);
    const role = input.role || 'primary';
    if (!ALLOWED_ROLES.has(role)) throw new BadRequestException('无效的文件角色');
    this.validateFile(input.filename, input.size_bytes, input.mime_type, resource.resource_kind || 'other', resource.resource_kind === 'mod' && version.revision === 1);
    if (!input.sha256 || !/^[a-f0-9]{64}$/i.test(input.sha256)) throw new BadRequestException('必须提供有效的 SHA-256');
    if (role !== 'primary') throw new BadRequestException('此草稿仅支持上传主文件');
    if (await this.files.exist({ where: { resource_version_id: version.id, role: 'primary' } })) {
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
    const uploadDraft = await this.drafts.findOne({ where: { resource_version_id: session.resource_version_id, user_id: actor.id, status: 'open' } });
    if (!uploadDraft) throw new ConflictException('版本上传草稿不存在或已完成');
    if (uploadDraft.expires_at.getTime() <= Date.now()) {
      await this.drafts.update(uploadDraft.id, { status: 'expired' });
      throw new ConflictException('版本上传草稿已过期，请重新创建');
    }
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
    this.validateFile(session.filename, object.size_bytes, object.mime_type, resource.resource_kind || 'other', resource.resource_kind === 'mod' && version.revision === 1);
    if (object.size_bytes !== Number(session.size_bytes) || object.sha256.toLowerCase() !== session.sha256) {
      throw new BadRequestException('资源存储对象与上传会话不匹配');
    }
    const bytes = await this.res.getObjectContent(object.public_id, { maxBytes: MAX_RESOURCE_SIZE });
    const actualHash = createHash('sha256').update(bytes).digest('hex');
    if (bytes.length !== object.size_bytes || actualHash !== object.sha256.toLowerCase()) {
      throw new ConflictException('资源存储对象内容与已验证元数据不匹配');
    }
    if (resource.status === 'draft') {
      if (!resource.public_id) throw new ConflictException('资源公开标识缺失，无法完成上传');
      if (!uploadDraft.request_metadata) throw new ConflictException('初始资源草稿元数据缺失');
      const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'mindforum-direct-resource-'));
      const tempFile = path.join(tempDirectory, session.filename.replace(/[^A-Za-z0-9._-]/g, '_').slice(-120) || 'upload.bin');
      try {
        await writeFile(tempFile, bytes, { mode: 0o600, flag: 'wx' });
        const completed = await this.resourceLifecycle.completeInitialDirectUpload({
          versionId: version.id,
          draftId: uploadDraft.id,
          sessionId: session.id,
          objectPublicId: object.public_id,
          actor,
          file: {
            file_name: session.filename,
            file_path: tempFile,
            file_size: object.size_bytes,
            mime_type: object.mime_type,
            content_hash: object.sha256.toLowerCase(),
            storage_backend: 'res',
            provider_object_id: object.public_id,
          },
        });
        return { ...completed, completed: true };
      } finally {
        await rm(tempDirectory, { recursive: true, force: true });
      }
    }
    if (resource.status !== 'draft') {
      if (!resource.public_id) throw new ConflictException('资源公开标识缺失，无法完成版本上传');
      const draftMetadata = uploadDraft.request_metadata as unknown as DirectVersionDraftInput | null;
      if (!draftMetadata || draftMetadata.version !== version.version) throw new ConflictException('版本上传草稿元数据缺失或不匹配');
      const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'mindforum-direct-version-'));
      const tempFile = path.join(tempDirectory, session.filename.replace(/[^A-Za-z0-9._-]/g, '_').slice(-120) || 'upload.bin');
      try {
        await writeFile(tempFile, bytes, { mode: 0o600, flag: 'wx' });
        await this.v2Writes.completeDirectVersion(resource.public_id, {
          file_name: session.filename,
          file_path: tempFile,
          file_size: object.size_bytes,
          mime_type: object.mime_type,
          content_hash: object.sha256.toLowerCase(),
          storage_backend: 'res',
          provider_object_id: object.public_id,
        }, draftMetadata, actor.id, {
          versionId: version.id,
          draftId: uploadDraft.id,
          sessionId: session.id,
          objectPublicId: object.public_id,
          verifiedBytes: bytes,
        });
        const completedSession = await this.sessions.findOne({ where: { id: session.id, user_id: actor.id } });
        if (!completedSession?.resource_file_public_id) throw new ConflictException('版本文件事务未完成');
        return { file_public_id: completedSession.resource_file_public_id, completed: true, version_public_id: version.public_id };
      } finally {
        await rm(tempDirectory, { recursive: true, force: true });
      }
    }
    throw new ConflictException('资源上传草稿状态无法完成');
  }
}
