import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createReadStream } from 'fs';
import { constants as fsConstants } from 'fs';
import { createHash, randomUUID } from 'crypto';
import { SettingsService } from '../settings/settings.service';
import { repairMojibakeFilename } from '@common/utils/filename.util';

export type StoredResourceFile = {
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  content_hash: string;
};

export type PreparedResourcePromotion = {
  sourcePath: string;
  targetPath: string;
  createdTarget: boolean;
};

@Injectable()
export class ResourceStorageService {
  private readonly logger = new Logger(ResourceStorageService.name);

  constructor(private readonly settingsService: SettingsService) {}

  private get uploadRoot(): string {
    return path.resolve(process.env.RESOURCE_UPLOAD_ROOT || './uploads');
  }

  private async getQuarantineDirectory(): Promise<string> {
    const target = path.join(this.uploadRoot, '.quarantine', 'resources');
    await fs.mkdir(target, { recursive: true });
    return target;
  }

  async cleanupStaleIncomingUploads(before: Date): Promise<number> {
    const directory = path.join(await this.getQuarantineDirectory(), '.incoming');
    let entries: import('fs').Dirent[];
    try { entries = await fs.readdir(directory, { withFileTypes: true }); }
    catch (error: any) { if (error?.code === 'ENOENT') return 0; throw error; }
    let removed = 0;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const candidate = path.resolve(directory, entry.name);
      if (!this.isInside(candidate, directory)) continue;
      try {
        const stat = await fs.stat(candidate);
        if (stat.mtime < before) { await fs.unlink(candidate); removed += 1; }
      } catch (error: any) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
    return removed;
  }

  async getResourceDirectory(): Promise<string> {
    const configured = (await this.settingsService.get('resource_upload_directory'))?.trim() || 'resources';
    const target = path.isAbsolute(configured) ? path.resolve(configured) : path.resolve(this.uploadRoot, configured);
    if (!path.isAbsolute(configured)) {
      const rootPrefix = `${this.uploadRoot}${path.sep}`;
      if (target !== this.uploadRoot && !target.startsWith(rootPrefix)) {
        throw new BadRequestException('资源存储目录必须位于 RESOURCE_UPLOAD_ROOT 内，或使用绝对路径');
      }
    }
    await fs.mkdir(target, { recursive: true });
    return target;
  }

  /**
   * New resource payloads remain in a non-public quarantine directory until a
   * moderator approves the resource. The controller never serves this path.
   */
  async storeIncoming(file: Express.Multer.File | undefined): Promise<StoredResourceFile | undefined> {
    if (!file) return undefined;
    const storedPath = path.join(await this.getQuarantineDirectory(), path.basename(file.filename));
    try {
      await fs.rename(file.path, storedPath);
    } catch (error: any) {
      if (error?.code !== 'EXDEV') throw error;
      await fs.copyFile(file.path, storedPath);
      await fs.unlink(file.path);
    }
    const contentHash = await new Promise<string>((resolve, reject) => {
      const hash = createHash('sha256');
      const stream = createReadStream(storedPath);
      stream.on('error', reject);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
    });
    return {
      file_name: repairMojibakeFilename(file.originalname) || 'file',
      file_path: storedPath,
      file_size: file.size,
      mime_type: file.mimetype,
      content_hash: contentHash,
    };
  }

  /**
   * A copied Mindustry schematic is base64-encoded binary, not an external
   * link. Decode it straight into the same private quarantine used by normal
   * resource uploads so moderation and download rules remain identical.
   */
  async storePastedSchematic(code: string): Promise<StoredResourceFile> {
    const normalized = code.replace(/\s+/g, '');
    if (!normalized || normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
      throw new BadRequestException('蓝图代码不是有效的 Base64 内容');
    }

    const data = Buffer.from(normalized, 'base64');
    const configured = Number(process.env.GAME_CONTENT_BLUEPRINT_MAX_BYTES);
    const maxBytes = Number.isSafeInteger(configured) && configured > 0
      ? Math.min(configured, 20 * 1024 * 1024)
      : 20 * 1024 * 1024;
    if (data.length < 5 || data.length > maxBytes || data.subarray(0, 4).toString('ascii') !== 'msch') {
      throw new BadRequestException('蓝图代码不是有效的 Mindustry .msch 文件');
    }

    const fileName = `pasted-schematic-${Date.now()}-${createHash('sha256').update(data).digest('hex').slice(0, 12)}.msch`;
    const storedPath = path.join(await this.getQuarantineDirectory(), fileName);
    await fs.writeFile(storedPath, data, { flag: 'wx', mode: 0o640 });

    return {
      file_name: fileName,
      file_path: storedPath,
      file_size: data.length,
      mime_type: 'application/octet-stream',
      content_hash: createHash('sha256').update(data).digest('hex'),
    };
  }

  /** Read a bounded file only from forum-managed resource/quarantine storage. */
  async readManagedFile(filePath: string, maxBytes: number): Promise<Buffer> {
    const managed = await this.statManagedFile(filePath);
    if (managed.size < 1 || managed.size > maxBytes) throw new BadRequestException('文件大小无效');
    return fs.readFile(managed.path);
  }

  /** Read a bounded file only from private quarantine, never from public resource storage. */
  async readQuarantinedFile(filePath: string, maxBytes: number): Promise<Buffer> {
    const root = await fs.realpath(await this.getQuarantineDirectory());
    const candidate = path.resolve(filePath);
    let resolved: string;
    try { resolved = await fs.realpath(candidate); }
    catch (error: any) { if (error?.code === 'ENOENT') throw new BadRequestException('私有附件不存在'); throw error; }
    if (!this.isInside(resolved, root)) throw new BadRequestException('私有附件存储路径无效');
    const stat = await fs.lstat(resolved);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > maxBytes) {
      throw new BadRequestException('私有附件大小或类型无效');
    }
    return fs.readFile(resolved);
  }

  async statManagedFile(filePath: string): Promise<{ path: string; size: number }> {
    const candidate = path.resolve(filePath);
    const roots = [await this.getQuarantineDirectory(), await this.getResourceDirectory()];
    if (!roots.some((root) => this.isInside(candidate, root))) throw new BadRequestException('文件存储路径无效');
    const stat = await fs.stat(candidate);
    if (!stat.isFile()) throw new BadRequestException('存储对象不是普通文件');
    return { path: candidate, size: stat.size };
  }

  private async move(source: string, target: string): Promise<void> {
    try {
      await fs.rename(source, target);
    } catch (error: any) {
      if (error?.code !== 'EXDEV') throw error;
      await fs.copyFile(source, target);
      await fs.unlink(source);
    }
  }

  private async hashFile(filePath: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const hash = createHash('sha256');
      const stream = createReadStream(filePath);
      stream.on('error', reject);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }

  private async existingPromotionMatches(targetPath: string, sourceHash: string): Promise<boolean> {
    let stat: import('fs').Stats;
    try { stat = await fs.lstat(targetPath); }
    catch (error: any) { if (error?.code === 'ENOENT') return false; throw error; }
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new BadRequestException('正式资源路径已存在非普通文件，无法发布');
    }
    if (await this.hashFile(targetPath) !== sourceHash) {
      throw new BadRequestException('正式资源目录中已存在不同内容的同名文件，无法覆盖');
    }
    return true;
  }

  /**
   * Copy a private quarantined payload into published storage without consuming
   * the source. The final name is installed with an exclusive hard link so a
   * concurrent or pre-existing file is never silently overwritten.
   */
  async preparePromotion(filePath: string): Promise<PreparedResourcePromotion> {
    const quarantinePath = await this.getQuarantineDirectory();
    const quarantineRealPath = await fs.realpath(quarantinePath);
    const sourceCandidate = path.resolve(filePath);
    if (!this.isInside(sourceCandidate, quarantinePath)) {
      throw new BadRequestException('只能发布 Resource quarantine 中的文件');
    }

    let candidateStat: import('fs').Stats;
    try { candidateStat = await fs.lstat(sourceCandidate); }
    catch (error: any) {
      if (error?.code === 'ENOENT') throw new BadRequestException('待发布的 Resource quarantine 文件不存在');
      throw error;
    }
    if (candidateStat.isSymbolicLink() || !candidateStat.isFile()) {
      throw new BadRequestException('待发布的 Resource quarantine 对象必须是普通文件');
    }

    let sourcePath: string;
    try { sourcePath = await fs.realpath(sourceCandidate); }
    catch (error: any) {
      if (error?.code === 'ENOENT') throw new BadRequestException('待发布的 Resource quarantine 文件不存在');
      throw error;
    }
    if (!this.isInside(sourcePath, quarantineRealPath)) {
      throw new BadRequestException('待发布的 Resource quarantine 路径无效');
    }

    const targetDirectory = await this.getResourceDirectory();
    const targetRealPath = await fs.realpath(targetDirectory);
    if (targetRealPath === quarantineRealPath || this.isInside(targetRealPath, quarantineRealPath)) {
      throw new BadRequestException('正式资源存储目录不能位于私有隔离区');
    }
    const targetPath = path.join(targetDirectory, path.basename(sourcePath));
    const sourceHash = await this.hashFile(sourcePath);
    if (await this.existingPromotionMatches(targetPath, sourceHash)) {
      return { sourcePath, targetPath, createdTarget: false };
    }

    // Stage in the destination directory, verify the bytes, then install using
    // link(2), which fails with EEXIST instead of replacing a concurrent file.
    const temporaryPath = path.join(targetDirectory, `.${path.basename(sourcePath)}.${randomUUID()}.pending`);
    let createdTarget = false;
    try {
      await fs.copyFile(sourcePath, temporaryPath, fsConstants.COPYFILE_EXCL);
      if (await this.hashFile(temporaryPath) !== sourceHash) {
        throw new BadRequestException('Resource quarantine 文件在发布准备期间发生变化');
      }
      try {
        await fs.link(temporaryPath, targetPath);
        createdTarget = true;
      } catch (error: any) {
        if (error?.code !== 'EEXIST' || !(await this.existingPromotionMatches(targetPath, sourceHash))) throw error;
      }
      return { sourcePath, targetPath, createdTarget };
    } finally {
      try { await fs.unlink(temporaryPath); }
      catch (error: any) {
        if (error?.code !== 'ENOENT') this.logger.warn(`Failed to remove temporary Resource promotion copy: ${error.message}`);
      }
    }
  }

  /** Promote a single quarantined file, retaining legacy final paths unchanged. */
  async promote(filePath: string | null | undefined): Promise<string | null | undefined> {
    if (!filePath) return filePath;
    const quarantine = await this.getQuarantineDirectory();
    const source = path.resolve(filePath);
    const prefix = `${quarantine}${path.sep}`;
    if (!source.startsWith(prefix)) return filePath;
    const target = path.join(await this.getResourceDirectory(), path.basename(source));

    // Approval can be retried after a request moved the payload but failed while
    // updating a later release or notification. Treat an already-promoted target
    // as success instead of trying to rename the missing quarantine source again.
    try {
      await fs.access(source);
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        try {
          await fs.access(target);
          return target;
        } catch {
          // Preserve the original ENOENT below so the moderation service can
          // turn it into a user-actionable API error.
        }
      }
      throw error;
    }

    await this.move(source, target);
    return target;
  }

  private isInside(candidate: string, root: string): boolean {
    return candidate.startsWith(`${root}${path.sep}`);
  }

  /** Delete a known managed file only; never follow a database path outside storage. */
  async removeManaged(filePath: string | null | undefined): Promise<boolean> {
    if (!filePath) return false;
    const candidate = path.resolve(filePath);
    const roots = [await this.getQuarantineDirectory(), await this.getResourceDirectory()];
    if (!roots.some((root) => this.isInside(candidate, root))) return false;
    try { await fs.unlink(candidate); return true; } catch (error: any) { if (error?.code === 'ENOENT') return false; throw error; }
  }

  /** Delete only a regular private-quarantine file; never unlink a public resource file. */
  async removeQuarantinedFile(filePath: string | null | undefined): Promise<boolean> {
    if (!filePath) return false;
    const root = await fs.realpath(await this.getQuarantineDirectory());
    const candidate = path.resolve(filePath);
    let resolved: string;
    try { resolved = await fs.realpath(candidate); }
    catch (error: any) { if (error?.code === 'ENOENT') return false; throw error; }
    if (!this.isInside(resolved, root)) return false;
    const stat = await fs.lstat(resolved);
    if (!stat.isFile() || stat.isSymbolicLink()) return false;
    try { await fs.unlink(resolved); return true; } catch (error: any) { if (error?.code === 'ENOENT') return false; throw error; }
  }

  /** Remove old unreferenced files left by interrupted uploads, never active references. */
  async cleanupOrphanedQuarantine(before: Date, referenced: ReadonlySet<string>): Promise<number> {
    const root = await this.getQuarantineDirectory();
    let removed = 0;
    const visit = async (directory: string): Promise<void> => {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        const candidate = path.join(directory, entry.name);
        if (entry.isDirectory()) { await visit(candidate); continue; }
        if (!entry.isFile() || referenced.has(path.resolve(candidate))) continue;
        const stat = await fs.stat(candidate);
        if (stat.mtime < before && await this.removeManaged(candidate)) removed += 1;
      }
    };
    await visit(root);
    return removed;
  }
}
