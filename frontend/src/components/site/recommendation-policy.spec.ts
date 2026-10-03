import { shouldRecommendMdtbbs } from './recommendation-policy';

describe('Mindustry Club mainland China recommendation', () => {
  it('shows for a Chinese region or language environment unless an international choice was made', () => {
    expect(shouldRecommendMdtbbs('CN')).toBe(true);
    expect(shouldRecommendMdtbbs('US', false, null, 'zh-CN,zh;q=0.9')).toBe(true);
    expect(shouldRecommendMdtbbs('CN', false, 'en', 'zh-CN')).toBe(false);
    expect(shouldRecommendMdtbbs('CN', true)).toBe(false);
    expect(shouldRecommendMdtbbs('US', false, 'ru', 'ru,en;q=0.8')).toBe(false);
    expect(shouldRecommendMdtbbs('US')).toBe(false);
  });
});
