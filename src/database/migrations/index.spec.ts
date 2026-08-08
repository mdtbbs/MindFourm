import { migrations } from './index';

describe('migration registry', () => {
  it('includes the resource comments schema migration', () => {
    expect(migrations.map((migration) => migration.name)).toContain(
      'CreateResourceComments1720000025000',
    );
  });
});
