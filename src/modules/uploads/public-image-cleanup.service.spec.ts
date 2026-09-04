jest.mock('fs/promises', () => ({
  readdir: jest.fn(),
  stat: jest.fn(),
  unlink: jest.fn(),
}));

jest.mock('@nestjs/common', () => ({
  Injectable: () => () => undefined,
}));

jest.mock('./public-image-upload', () => ({
  PUBLIC_IMAGE_UPLOAD_DIR: './uploads/public-images',
}));

import * as fs from 'fs/promises';
import { PublicImageCleanupService } from './public-image-cleanup.service';

const readdir = fs.readdir as jest.Mock;
const stat = fs.stat as jest.Mock;
const unlink = fs.unlink as jest.Mock;

function file(name: string) {
  return { name, isFile: () => true };
}

describe('PublicImageCleanupService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('keeps referenced and recent images, but removes only expired orphan files', async () => {
    const dataSource = {
      query: jest.fn().mockImplementation(async (query: string) => (
        query.includes('FROM posts')
          ? [{ value: '![kept](/uploads/public-images/referenced.png)' }]
          : []
      )),
    };
    const settings = { getNumber: jest.fn().mockResolvedValue(7) };
    const service = new PublicImageCleanupService(dataSource as any, settings as any);
    const now = new Date('2026-09-04T12:00:00.000Z');

    readdir.mockResolvedValue([
      file('referenced.png'),
      file('recent.png'),
      file('orphan.png'),
    ]);
    stat.mockImplementation(async (target: string) => ({
      mtime: target.endsWith('recent.png')
        ? new Date('2026-09-03T12:00:00.000Z')
        : new Date('2026-08-01T12:00:00.000Z'),
    }));
    unlink.mockResolvedValue(undefined);

    await expect(service.cleanupOrphanedPublicImages(now)).resolves.toEqual({
      retentionDays: 7,
      scanned: 3,
      keptReferenced: 1,
      keptRecent: 1,
      deleted: 1,
      failed: 0,
    });
    expect(unlink).toHaveBeenCalledTimes(1);
    expect(unlink.mock.calls[0][0]).toMatch(/orphan\.png$/);
  });

  it('does not fail when the upload directory has not been created yet', async () => {
    const service = new PublicImageCleanupService(
      { query: jest.fn().mockResolvedValue([]) } as any,
      { getNumber: jest.fn().mockResolvedValue(undefined) } as any,
    );
    const missing = Object.assign(new Error('missing'), { code: 'ENOENT' });
    readdir.mockRejectedValue(missing);

    await expect(service.cleanupOrphanedPublicImages()).resolves.toEqual({
      retentionDays: 7,
      scanned: 0,
      keptReferenced: 0,
      keptRecent: 0,
      deleted: 0,
      failed: 0,
    });
  });
});
