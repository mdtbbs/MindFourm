import { normalizePostTitle } from './post-title.util';

describe('normalizePostTitle', () => {
  it.each([['# 标题', '标题'], ['# # 标题', '标题'], ['  ## 标题 ', '标题'], ['版本 #1', '版本 #1']])(
    'normalizes %p', (input, expected) => expect(normalizePostTitle(input)).toBe(expected),
  );
});
