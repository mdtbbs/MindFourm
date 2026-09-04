import { LanLinkQuickCodeService } from './lanlink-quick-code.service';

function createRepositoryMock() {
  let records: any[] = [];
  let nextId = 1;

  const matches = (record: any, where: Record<string, any>) => Object.entries(where).every(([key, value]) => record[key] === value);

  return {
    findOne: jest.fn(async (opts: any) => {
      const record = records.find((item) => matches(item, opts.where || {}));
      if (!record) return null;
      if (opts.relations?.includes('user')) {
        return { ...record, user: record.user };
      }
      return { ...record };
    }),
    exist: jest.fn(async (opts: any) => records.some((item) => matches(item, opts.where || {}))),
    create: jest.fn((value: any) => ({ ...value })),
    save: jest.fn(async (value: any) => {
      const now = new Date('2026-07-29T00:00:00.000Z');
      const record = {
        ...value,
        id: value.id || nextId++,
        created_at: value.created_at || now,
        updated_at: now,
      };
      if (!record.user) {
        record.user = {
          id: record.user_id,
          mindauth_id: 1000 + record.user_id,
          username: `user-${record.user_id}`,
          email: `user-${record.user_id}@example.com`,
          avatar_url: null,
          role: 'user',
          phone_verified: true,
          phone_verified_at: now,
        };
      }
      const index = records.findIndex((item) => item.id === record.id || item.user_id === record.user_id);
      if (index >= 0) records[index] = record;
      else records.push(record);
      return { ...record };
    }),
    records: () => records,
  };
}

describe('LanLinkQuickCodeService', () => {
  const createService = () => {
    const codeRepository = createRepositoryMock();
    const userRepository = { findOne: jest.fn() };
    return {
      codeRepository,
      userRepository,
      service: new LanLinkQuickCodeService(codeRepository as any, userRepository as any),
    };
  };

  it('generates a distinct LL login code and stores only its hash metadata', async () => {
    const { codeRepository: repo, service } = createService();

    const result = await service.generateForUser(7);

    expect(result.code).toMatch(/^LL-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(result.code.startsWith('MDT-')).toBe(false);
    expect(result.status.enabled).toBe(true);
    expect(result.status.token_version).toBe(1);

    const stored = repo.records()[0];
    expect(stored.user_id).toBe(7);
    expect(stored.code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.code_hash).not.toContain(result.code);
    expect(stored.code_prefix).toBe(result.code.slice(0, 7));
  });

  it('validates normalized codes and bumps usage metadata', async () => {
    const { service } = createService();
    const generated = await service.generateForUser(3);

    const result = await service.validate(generated.code.toLowerCase().replace(/-/g, ' '));

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.user.id).toBe(3);
      expect(result.code.use_count).toBe(1);
      expect(result.code.last_used_at).toBeInstanceOf(Date);
    }
  });

  it('rotates forgotten codes and invalidates disabled codes', async () => {
    const { service } = createService();
    const first = await service.generateForUser(5);
    const second = await service.generateForUser(5);

    expect(second.status.token_version).toBe(2);
    expect(second.code).not.toBe(first.code);
    expect(await service.validate(first.code)).toEqual({ valid: false });

    await service.disableForUser(5);
    expect(await service.validate(second.code)).toEqual({ valid: false });
  });

  it('reads the latest forum phone verification status for token refresh', async () => {
    const { service, userRepository } = createService();
    userRepository.findOne.mockResolvedValue({ id: 9, username: 'user-9', phone_verified: true });

    await expect(service.getUserStatus(9)).resolves.toMatchObject({ id: 9, phone_verified: true });
    expect(userRepository.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 9 } }));
  });
});
