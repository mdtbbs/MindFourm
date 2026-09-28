import { ContentSafetyService } from './content-safety.service';

describe('ContentSafetyService', () => {
  const settings = {
    get: jest.fn().mockResolvedValue(''),
    getNumber: jest.fn(async (key: string) => ({
      content_safety_review_threshold: 3,
      content_safety_link_review_threshold: 8,
      content_safety_duplicate_min_characters: 40,
      content_safety_duplicate_window_seconds: 120,
    } as Record<string, number>)[key] ?? null),
  };
  const logs = { log: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('holds repeated long submissions from the same account for review', async () => {
    const redis = { setIfNotExists: jest.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false) };
    const service = new ContentSafetyService(settings as any, logs as any, redis as any);
    const text = 'A repeated community post with enough normalized characters to check.';

    const first = await service.assess(text, { actorId: 17, surface: 'post' });
    const repeated = await service.assess(text, { actorId: 17, surface: 'post' });

    expect(first.mustReview).toBe(false);
    expect(repeated).toMatchObject({ score: 3, rules: ['duplicate_recent'], mustReview: true });
    expect(redis.setIfNotExists).toHaveBeenCalledWith(
      expect.stringMatching(/^content-safety:recent:post:17:[a-f0-9]{64}$/),
      '1',
      120,
    );
  });

  it('uses a configurable URL threshold and leaves ordinary link use alone', async () => {
    const redis = { setIfNotExists: jest.fn() };
    const thresholdSettings = {
      ...settings,
      getNumber: jest.fn(async (key: string) => key === 'content_safety_link_review_threshold'
        ? 3
        : settings.getNumber(key)),
    };
    const service = new ContentSafetyService(thresholdSettings as any, logs as any, redis as any);
    const ordinary = await service.assess('Read https://example.org and https://example.net for details.');
    const spam = await service.assess('https://one.example https://two.example https://three.example');

    expect(ordinary.rules).not.toContain('excessive_links');
    expect(spam.rules).toContain('excessive_links');
    expect(redis.setIfNotExists).not.toHaveBeenCalled();
  });
});
