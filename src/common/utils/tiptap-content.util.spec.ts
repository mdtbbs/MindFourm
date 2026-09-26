import { extractTiptapText, markdownToTiptapDocument, normalizeTiptapDocument, renderTiptapDocument, resolveContentSource, resolveOptionalContentSource } from './tiptap-content.util';

describe('Tiptap rich-text source', () => {
  it('converts legacy Markdown into the shared editor schema and renders safe HTML', () => {
    const document = markdownToTiptapDocument('# Title\n\n**bold** and [safe](https://example.org)');
    expect(document.content[0]).toMatchObject({ type: 'heading', attrs: { level: 1 } });
    const content = resolveContentSource(undefined, document);
    expect(content.content).toContain('# Title');
    expect(content.content_html).toContain('<h1>Title</h1>');
    expect(content.content_html).toContain('<strong>bold</strong>');
    expect(content.content_html).toContain('rel="nofollow noopener noreferrer"');
    expect(content.content_text).toBe('Title\nbold and safe');
  });

  it('rejects unsupported nodes, invalid structure and dangerous links', () => {
    expect(() => normalizeTiptapDocument({ type: 'doc', content: [{ type: 'script', content: [] }] })).toThrow();
    expect(() => normalizeTiptapDocument({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }] })).toThrow();
    expect(() => normalizeTiptapDocument({ type: 'doc', content: [{ type: 'table', content: [{ type: 'paragraph', content: [] }] }] })).toThrow();
  });

  it('strips executable attributes and refuses unsafe image sources', () => {
    const safe = renderTiptapDocument({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'image', attrs: { src: 'https://cdn.example.org/a.png', alt: 'cover', onerror: 'alert(1)' } }] }],
    });
    expect(safe).toContain('<img src="https://cdn.example.org/a.png" alt="cover"');
    expect(safe).not.toContain('onerror');
    expect(() => normalizeTiptapDocument({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'image', attrs: { src: 'data:image/svg+xml,<svg onload=alert(1)>' } }] }] })).toThrow();
  });

  it('accepts the editor table defaults and builds an empty optional resource description', () => {
    const table = normalizeTiptapDocument({ type: 'doc', content: [{ type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [] }] }] }] }] });
    expect(table.content[0].type).toBe('table');
    const empty = resolveOptionalContentSource(undefined, { type: 'doc', content: [{ type: 'paragraph' }] });
    expect(empty?.content_text).toBe('');
    expect(extractTiptapText(markdownToTiptapDocument('one\n\ntwo'))).toBe('one\ntwo');
  });
});
