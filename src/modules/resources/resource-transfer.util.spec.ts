import { BadRequestException } from '@nestjs/common';
import { mindustryClubSite } from '@config/site-profile';
import { buildResourceExportManifest, parseResourceImportManifest, RESOURCE_TRANSFER_FORMAT } from './resource-transfer.util';

describe('resource transfer manifest', () => {
  it('exports portable metadata and identifies the exporting site resource', () => {
    const manifest = buildResourceExportManifest({
      id: 12,
      public_id: 'public-id-12',
      title: 'Factory map',
      resource_type: 'upload',
      resource_kind: 'map',
      file_name: 'factory.msav',
      is_public: 1,
      version: 'v146',
      metadata: { planets: ['Serpulo'] },
    }, mindustryClubSite);

    expect(manifest.format).toBe(RESOURCE_TRANSFER_FORMAT);
    expect(manifest.origin).toEqual({
      site: 'mindustry-club',
      resource_id: '12',
      url: 'https://mindustry.club/resources/12',
    });
    expect(manifest.resource).toMatchObject({
      title: 'Factory map',
      file_name: 'factory.msav',
      file_download_url: 'https://mindustry.club/api/resources/12/download',
      metadata: { planets: ['Serpulo'] },
    });
  });

  it('accepts only a manifest from the other configured site', () => {
    const value = {
      format: RESOURCE_TRANSFER_FORMAT,
      origin: { site: 'mdtbbs', resource_id: '123', url: 'https://mdtbbs.cn/resources/123' },
      resource: { title: 'Map', resource_type: 'upload' },
    };
    expect(parseResourceImportManifest(JSON.stringify(value), 'mindustry-club')).toMatchObject(value);
    expect(() => parseResourceImportManifest(value, 'mdtbbs')).toThrow(BadRequestException);
    expect(() => parseResourceImportManifest({ ...value, format: 'unknown' }, 'mindustry-club')).toThrow(BadRequestException);
  });
});
