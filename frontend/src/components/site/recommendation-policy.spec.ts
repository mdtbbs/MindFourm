import { shouldRecommendMdtbbs, shouldSubdueMdtbbsRecommendation } from './recommendation-policy';

describe('Mindustry Club mainland China recommendation', () => {
  it('shows only for trusted CN region and hides after dismissal', () => {
    expect(shouldRecommendMdtbbs('CN')).toBe(true);
    expect(shouldRecommendMdtbbs('CN', true)).toBe(false);
    expect(shouldRecommendMdtbbs('US')).toBe(false);
    expect(shouldRecommendMdtbbs(undefined)).toBe(false);
  });

  it('uses a quieter presentation for visitors with an international language preference', () => {
    expect(shouldSubdueMdtbbsRecommendation(null, 'ja,en;q=0.8')).toBe(true);
    expect(shouldSubdueMdtbbsRecommendation('ru', 'zh-CN')).toBe(true);
    expect(shouldSubdueMdtbbsRecommendation('zh-CN', 'zh-CN')).toBe(false);
  });
});
