import { MediaService } from './media.service';

describe('MediaService', () => {
  it('returns empty array when no media is linked', async () => {
    const mediaLinkRepo = { find: jest.fn().mockResolvedValue([]) };
    const service = new MediaService({} as any, mediaLinkRepo as any);

    const result = await service.getResourceMedia(1);
    expect(result).toEqual([]);
  });

  it('returns cover image when linked', async () => {
    const coverAsset = { id: 1, public_id: 'abc', media_type: 'cover_image', url: '/uploads/cover.jpg' };
    const mediaLinkRepo = {
      findOne: jest.fn().mockResolvedValue({ media_asset: coverAsset }),
    };
    const service = new MediaService({} as any, mediaLinkRepo as any);

    const result = await service.getResourceCover(1);
    expect(result).toBe(coverAsset);
  });

  it('returns null when no cover is linked', async () => {
    const mediaLinkRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const service = new MediaService({} as any, mediaLinkRepo as any);

    const result = await service.getResourceCover(1);
    expect(result).toBeNull();
  });

  it('creates and links a media asset', async () => {
    const savedAsset = { id: 10, public_id: 'uuid-1', media_type: 'screenshot' };
    const mediaAssetRepo = {
      save: jest.fn().mockResolvedValue(savedAsset),
    };
    const mediaLinkRepo = {
      save: jest.fn().mockResolvedValue({}),
    };
    const service = new MediaService(mediaAssetRepo as any, mediaLinkRepo as any);

    const result = await service.createAndLink({
      resourceId: 1, mediaType: 'screenshot', role: 'screenshot',
      storageBackend: 'local', storageKey: '/uploads/screen.png',
      url: null, originalFilename: 'screen.png', mimeType: 'image/png', sizeBytes: 2048,
    });

    expect(result).toBe(savedAsset);
    expect(mediaLinkRepo.save).toHaveBeenCalled();
  });
});
