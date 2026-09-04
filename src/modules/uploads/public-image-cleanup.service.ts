import { Injectable } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { SettingsService } from '../settings/settings.service';
import { PUBLIC_IMAGE_UPLOAD_DIR } from './public-image-upload';

const DEFAULT_RETENTION_DAYS = 7;
const MAX_RETENTION_DAYS = 365;

/**
 * The editor writes only these generated filenames. Matching the complete public
 * URL rather than a generic image URL means external images are never candidates
 * for deletion.
 */
const PUBLIC_IMAGE_URL_PATTERN = /(?:https?:\/\/[^\s"'<>()[\]]+)?\/uploads\/public-images\/([A-Za-z0-9][A-Za-z0-9._-]*)/g;

/**
 * Every persisted surface that can carry a public editor image. Revision tables
 * intentionally participate: an image still visible in an edit-history screen is
 * not orphaned just because the current body no longer uses it.
 */
const REFERENCE_QUERIES = [
  'SELECT content AS value FROM posts WHERE content IS NOT NULL',
  'SELECT content AS value FROM replies WHERE content IS NOT NULL',
  'SELECT content AS value FROM resource_comments WHERE content IS NOT NULL',
  'SELECT content AS value FROM messages WHERE content IS NOT NULL',
  'SELECT content AS value FROM post_revisions WHERE content IS NOT NULL',
  'SELECT description AS value FROM resources WHERE description IS NOT NULL',
  'SELECT content AS value FROM resources WHERE content IS NOT NULL',
  'SELECT metadata_json AS value FROM resources WHERE metadata_json IS NOT NULL',
  'SELECT content AS value FROM resource_versions WHERE content IS NOT NULL',
  'SELECT release_notes_markdown AS value FROM resource_versions WHERE release_notes_markdown IS NOT NULL',
  'SELECT content_markdown AS value FROM notices WHERE content_markdown IS NOT NULL',
  'SELECT content_markdown AS value FROM notice_revisions WHERE content_markdown IS NOT NULL',
  'SELECT summary AS value FROM knowledge_articles WHERE summary IS NOT NULL',
  'SELECT content_markdown AS value FROM knowledge_articles WHERE content_markdown IS NOT NULL',
  'SELECT content_markdown AS value FROM knowledge_revisions WHERE content_markdown IS NOT NULL',
  'SELECT description AS value FROM feedbacks WHERE description IS NOT NULL',
  'SELECT description AS value FROM groups WHERE description IS NOT NULL',
  'SELECT icon AS value FROM groups WHERE icon IS NOT NULL',
  'SELECT description AS value FROM group_chats WHERE description IS NOT NULL',
  'SELECT url AS value FROM media_assets WHERE url IS NOT NULL',
  'SELECT storage_key AS value FROM media_assets WHERE storage_key IS NOT NULL',
  'SELECT avatar_url AS value FROM users WHERE avatar_url IS NOT NULL',
  'SELECT pending_avatar_url AS value FROM users WHERE pending_avatar_url IS NOT NULL',
  'SELECT value FROM settings WHERE value IS NOT NULL',
];

export interface PublicImageCleanupResult {
  retentionDays: number;
  scanned: number;
  keptReferenced: number;
  keptRecent: number;
  deleted: number;
  failed: number;
}

function toSearchableText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function referencedFilenames(value: unknown): string[] {
  const text = toSearchableText(value);
  const filenames = new Set<string>();
  const pattern = new RegExp(PUBLIC_IMAGE_URL_PATTERN);
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    filenames.add(match[1]);
  }

  return [...filenames];
}

@Injectable()
export class PublicImageCleanupService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly settingsService: SettingsService,
  ) {}

  /**
   * Deletes only expired public images for which no persisted reference exists.
   * This is deliberately an administrator-triggered maintenance operation: users
   * may spend hours drafting a post after uploading an image.
   */
  async cleanupOrphanedPublicImages(now = new Date()): Promise<PublicImageCleanupResult> {
    const retentionDays = await this.getRetentionDays();
    const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
    const referenced = await this.getReferencedFilenames();
    const directory = path.resolve(PUBLIC_IMAGE_UPLOAD_DIR);

    const entries = await (async () => {
      try {
        return await fs.readdir(directory, { withFileTypes: true, encoding: 'utf8' });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    })();

    if (!entries) {
      return { retentionDays, scanned: 0, keptReferenced: 0, keptRecent: 0, deleted: 0, failed: 0 };
    }

    const result: PublicImageCleanupResult = {
      retentionDays,
      scanned: 0,
      keptReferenced: 0,
      keptRecent: 0,
      deleted: 0,
      failed: 0,
    };

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      result.scanned += 1;

      // `readdir` returns names, but keep the containment guard in case this method
      // is ever adapted to a different filesystem provider.
      const candidate = path.resolve(directory, entry.name);
      if (!candidate.startsWith(`${directory}${path.sep}`)) {
        result.failed += 1;
        continue;
      }

      if (referenced.has(entry.name)) {
        result.keptReferenced += 1;
        continue;
      }

      try {
        const stat = await fs.stat(candidate);
        if (stat.mtime > cutoff) {
          result.keptRecent += 1;
          continue;
        }
        await fs.unlink(candidate);
        result.deleted += 1;
      } catch {
        // A concurrent upload/delete must not make the entire maintenance job fail.
        result.failed += 1;
      }
    }

    return result;
  }

  private async getRetentionDays(): Promise<number> {
    const configured = await this.settingsService.getNumber('cleanup_public_image_retention_days');
    if (typeof configured !== 'number' || !Number.isFinite(configured) || configured < 1) {
      return DEFAULT_RETENTION_DAYS;
    }
    return Math.min(Math.floor(configured), MAX_RETENTION_DAYS);
  }

  private async getReferencedFilenames(): Promise<Set<string>> {
    const rowsByQuery = await Promise.all(
      REFERENCE_QUERIES.map((query) => this.dataSource.query(query) as Promise<Array<{ value: unknown }>>),
    );
    const filenames = new Set<string>();

    for (const rows of rowsByQuery) {
      for (const row of rows) {
        for (const filename of referencedFilenames(row.value)) {
          filenames.add(filename);
        }
      }
    }

    return filenames;
  }
}
