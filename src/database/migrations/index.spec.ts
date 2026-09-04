import { migrations } from './index';

describe('migration registry', () => {
  it('includes the resource comments schema migration', () => {
    expect(migrations.map((migration) => migration.name)).toContain(
      'CreateResourceComments1720000025000',
    );
  });

  it('includes the media and download delivery migration', () => {
    expect(migrations.map((migration) => migration.name)).toContain(
      'CreateMediaAndDownloadDelivery1720000027000',
    );
  });

  it('includes the immutable legal acceptance audit migration', () => {
    expect(migrations.map((migration) => migration.name)).toContain(
      'CreateLegalAcceptances1720000038000',
    );
  });

  it('includes attachment moderation before new uploads are exposed', () => {
    expect(migrations.map((migration) => migration.name)).toContain(
      'AddAttachmentModeration1720000041000',
    );
  });

  it('includes SHA-256 storage for resource files', () => {
    expect(migrations.map((migration) => migration.name)).toContain(
      'AddResourceSha2561720000042000',
    );
  });

  it('includes the legacy footer branding correction', () => {
    expect(migrations.map((migration) => migration.name)).toContain(
      'FixLegacyFooterBrand1720000043000',
    );
  });

  it('includes persisted post activity before discussion lists use it', () => {
    expect(migrations.map((migration) => migration.name)).toContain(
      'AddPostLastActivity1720000045000',
    );
  });

  it('includes the first-class notices migration', () => {
    expect(migrations.map((migration) => migration.name)).toContain(
      'CreateNotices1720000046000',
    );
  });
});
