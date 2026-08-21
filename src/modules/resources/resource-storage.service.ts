import { BadRequestException, Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createReadStream } from 'fs';
import { createHash } from 'crypto';
import { SettingsService } from '../settings/settings.service';

export type StoredResourceFile = {
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  content_hash: string;
};

@Injectable()
export class ResourceStorageService {
  constructor(private readonly settingsService: SettingsService) {}

  private get uploadRoot(): string {
    return path.resolve(process.env.RESOURCE_UPLOAD_ROOT || './uploads');
  }

  private async getQuarantineDirectory(): Promise<string> {
    const target = path.join(this.uploadRoot, '.quarantine', 'resources');
    await fs.mkdir(target, { recursive: true });
    return target;
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
    return { file_name: file.originalname, file_path: storedPath, file_size: file.size, mime_type: file.mimetype, content_hash: contentHash };
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

  /** Promote a single quarantined file, retaining legacy final paths unchanged. */
  async promote(filePath: string | null | undefined): Promise<string | null | undefined> {
    if (!filePath) return filePath;
    const quarantine = await this.getQuarantineDirectory();
    const source = path.resolve(filePath);
    const prefix = `${quarantine}${path.sep}`;
    if (!source.startsWith(prefix)) return filePath;
    const target = path.join(await this.getResourceDirectory(), path.basename(source));
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
