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
});
