import { AuthService } from './auth.service';
import { LegalAcceptance } from '@entities/legal-acceptance.entity';
import { User } from '@entities/user.entity';

describe('AuthService legal acceptance audit', () => {
  const createService = (settingsValues: Record<string, unknown>, latestAcceptance: unknown = null) => {
    const manager = { transaction: jest.fn() };
    const usersRepository = { manager };
    const legalAcceptanceRepository = {
      manager,
      findOne: jest.fn().mockResolvedValue(latestAcceptance),
    };
    const settingsService = {
      getBoolean: jest.fn().mockResolvedValue(true),
      get: jest.fn((key: string) => Promise.resolve(settingsValues[key] ?? null)),
    };
    return {
      service: new AuthService(
        usersRepository as any,
        {} as any,
        legalAcceptanceRepository as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        settingsService as any,
      ),
    };
  };

  it('records the exact terms and privacy document hashes with acceptance context', async () => {
    const insert = jest.fn().mockResolvedValue(undefined);
    const update = jest.fn().mockResolvedValue(undefined);
    const manager = {
      transaction: jest.fn(async (work: (transaction: any) => Promise<void>) => work({
        getRepository: (entity: unknown) => entity === LegalAcceptance ? { insert } : { update },
      })),
    };
    const usersRepository = { manager };
    const legalAcceptanceRepository = { manager };
    const settingsService = {
      get: jest.fn()
        .mockResolvedValueOnce('# Terms v2')
        .mockResolvedValueOnce('# Privacy v3'),
    };
    const service = new AuthService(
      usersRepository as any,
      {} as any,
      legalAcceptanceRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      settingsService as any,
    );

    await service.recordTermsAcceptance(42, {
      clientIp: '203.0.113.7',
      userAgent: 'Legal-Acceptance-Test/1.0',
    });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 42,
      terms_version: 'sha256:3bed6dfbaff8cdaa36d16dfee45f936317518b6d19010ebb79b79c3279a3ca8b',
      terms_content_hash: '3bed6dfbaff8cdaa36d16dfee45f936317518b6d19010ebb79b79c3279a3ca8b',
      privacy_version: 'sha256:c7d2f8faeced811cc4d88d60526414510608a55040c0abc8a00496e57482a9e2',
      privacy_content_hash: 'c7d2f8faeced811cc4d88d60526414510608a55040c0abc8a00496e57482a9e2',
      ip_address: '203.0.113.7',
      user_agent: 'Legal-Acceptance-Test/1.0',
      accepted_at: expect.any(Date),
    }));
    expect(update).toHaveBeenCalledWith(42, { terms_accepted_at: expect.any(Date) });
    expect(manager.transaction).toHaveBeenCalledTimes(1);
  });

  it('requires a new acceptance after either legal document changes', async () => {
    const { service } = createService(
      { footer_terms_content: '# Terms current', footer_privacy_content: '# Privacy current' },
      {
        terms_content_hash: 'old-terms-hash',
        privacy_content_hash: 'old-privacy-hash',
      },
    );

    await expect(service.checkNeedsTermsAcceptance({ id: 42 } as any)).resolves.toBe(true);
  });
});
