import { normalizeStoredContent } from '@/lib/content/normalize-content';

describe('stored Markdown normalization', () => {
  it.each(['`text`', '中文 `text` 中文', '`a*b`', '`a b`', '``a ` b``'])('preserves Markdown code spans: %s', (value) => {
    expect(normalizeStoredContent(value)).toBe(value);
  });

  it('preserves intentionally escaped Markdown backticks', () => {
    expect(normalizeStoredContent('\\`text\\`')).toBe('\\`text\\`');
  });

  it('converts legacy sanitized inline code HTML without injecting HTML', () => {
    expect(normalizeStoredContent('<p>中文 <code>text</code> 中文</p>')).toBe('中文 `text` 中文');
  });
});
