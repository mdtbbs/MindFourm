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

  it('includes the GitHub synchronization classification repair', () => {
    expect(migrations.map((migration) => migration.name)).toContain(
      'RepairLegacyGithubSyncPostClassification1720000052000',
    );
  });

  it('includes persisted resource preview state before renderer output is exposed', () => {
    expect(migrations.map((migration) => migration.name)).toContain(
      'AddResourceRenderState1720000053000',
    );
  });

  it('includes stable resource public ids before resource likes', () => {
    const names = migrations.map((migration) => migration.name);
    expect(names).toContain('BackfillResourcePublicIds1720000054000');
    expect(names).toContain('CreateResourceLikes1720000055000');
    expect(names.indexOf('BackfillResourcePublicIds1720000054000')).toBeLessThan(names.indexOf('CreateResourceLikes1720000055000'));
  });

  it('adds durable Game Content featured, views, downloads, and upload-session storage', () => {
    expect(migrations.map((migration) => migration.name)).toContain('GameContentDurability1720000060000');
  });

  it('includes the Cloud Saves v1 schema migration after the multiplayer schema', () => {
    const names = migrations.map((migration) => migration.name);
    expect(names).toContain('CloudSavesV11720000160000');
    expect(names.indexOf('MultiplayerPlatformV11720000150000')).toBeLessThan(names.indexOf('CloudSavesV11720000160000'));
  });

  it('upgrades the legacy download event placeholder after creating durable Game Content tables', () => {
    const names = migrations.map((migration) => migration.name);
    expect(names).toContain('UpgradeDownloadEvents1720000070000');
    expect(names.indexOf('GameContentDurability1720000060000')).toBeLessThan(names.indexOf('UpgradeDownloadEvents1720000070000'));
  });
});
