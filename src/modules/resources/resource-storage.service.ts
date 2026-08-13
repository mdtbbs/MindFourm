import { BadRequestException, Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { SettingsService } from '../settings/settings.service';

export type StoredResourceFile = {
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
};

@Injectable()
export class ResourceStorageService {
  constructor(private readonly settingsService: SettingsService) {}

  private get uploadRoot(): string {
    return path.resolve(process.env.RESOURCE_UPLOAD_ROOT || './uploads');
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

  async storeIncoming(file: Express.Multer.File | undefined): Promise<StoredResourceFile | undefined> {
    if (!file) return undefined;
    const storedPath = path.join(await this.getResourceDirectory(), path.basename(file.filename));
    try {
      await fs.rename(file.path, storedPath);
    } catch (error: any) {
      if (error?.code !== 'EXDEV') throw error;
      await fs.copyFile(file.path, storedPath);
      await fs.unlink(file.path);
    }
    return { file_name: file.originalname, file_path: storedPath, file_size: file.size, mime_type: file.mimetype };
  }
}
