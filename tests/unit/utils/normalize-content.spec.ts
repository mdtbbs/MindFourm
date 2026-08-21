import {
  normalizeStoredContent,
  toContentExcerpt,
} from '../../../frontend/src/lib/content/normalize-content';

describe('content normalization', () => {
  it('removes escaped legacy HTML wrappers while preserving Markdown images', () => {
    const content = '&lt;p&gt;&lt;/p&gt;![image.png](/api/attachments/18/download)';

    expect(normalizeStoredContent(content)).toBe('![image.png](/api/attachments/18/download)');
  });

  it('turns image Markdown into safe readable text in excerpts', () => {
    const content = '&lt;p&gt;更新内容&lt;/p&gt;![image.png](/api/attachments/18/download)';

    expect(toContentExcerpt(content)).toBe('更新内容 image.png');
    expect(toContentExcerpt(content)).not.toContain('/api/attachments/');
  });

  it('does not convert arbitrary HTML-like Markdown examples', () => {
    expect(normalizeStoredContent('比较 1 < 2 与 3 > 2')).toBe('比较 1 < 2 与 3 > 2');
  });
});
