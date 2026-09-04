import { getMetadataArgsStorage } from 'typeorm';
import { MobileSession } from './mobile-session.entity';

describe('MobileSession entity metadata', () => {
  it('uses an explicit MySQL-compatible type for nullable IP addresses', () => {
    const column = getMetadataArgsStorage().columns.find(
      (item) => item.target === MobileSession && item.propertyName === 'ip_address',
    );
    expect(column?.options).toMatchObject({ type: 'varchar', length: 45, nullable: true });
  });
});
