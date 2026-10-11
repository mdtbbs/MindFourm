import { collectTiptapMentionIds, extractTiptapText, markdownToTiptapDocument, normalizeTiptapDocument, renderTiptapDocument, resolveContentSource, resolveOptionalContentSource } from './tiptap-content.util';

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

  it('rejects unknown executable attributes and refuses unsafe image sources', () => {
    expect(() => renderTiptapDocument({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'image', attrs: { src: 'https://cdn.example.org/a.png', alt: 'cover', onerror: 'alert(1)' } }] }],
    })).toThrow();
    const safe = renderTiptapDocument({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'image', attrs: { src: 'https://cdn.example.org/a.png', alt: 'cover' } }] }],
    });
    expect(safe).toContain('<img src="https://cdn.example.org/a.png" alt="cover"');
    expect(safe).not.toContain('onerror');
    expect(() => normalizeTiptapDocument({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'image', attrs: { src: 'data:image/svg+xml,<svg onload=alert(1)>' } }] }] })).toThrow();
  });

  it('accepts the editor table defaults and builds an empty optional resource description', () => {
    const table = normalizeTiptapDocument({ type: 'doc', content: [{ type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [] }] }] }] }] });
    expect(table.content[0].type).toBe('table');
    const empty = resolveOptionalContentSource(undefined, undefined);
    expect(empty).toBeNull();
    expect(extractTiptapText(markdownToTiptapDocument('one\n\ntwo'))).toBe('one\ntwo');
  });

  it('canonicalizes tight list attributes and rejects non-boolean values', () => {
    const document = normalizeTiptapDocument({ type: 'doc', content: [
      { type: 'bulletList', attrs: { tight: true }, content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] }] },
      { type: 'orderedList', attrs: { start: 1, tight: false }, content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'two' }] }] }] },
    ] }, { schemaVersion: 2 });
    expect(document.content[0].attrs).toEqual({ tight: true });
    expect(document.content[1].attrs).toEqual({ tight: false });
    expect(() => normalizeTiptapDocument({ type: 'doc', content: [{ type: 'bulletList', attrs: { tight: 'yes' }, content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] }] }, { schemaVersion: 2 })).toThrow();
  });

  it('rejects unsafe URLs, executable attributes, invalid CSS-like marks, and forged custom emoji fields', () => {
    const badDocuments = [
      { type: 'image', attrs: { src: 'javascript:alert(1)' } },
      { type: 'image', attrs: { src: 'data:image/png;base64,AAAA' } },
      { type: 'video', attrs: { provider: 'direct', src: 'http://cdn.example.org/movie.mp4', title: '' } },
      { type: 'video', attrs: { provider: 'youtube', videoId: 'abcdefghijk', title: '' } },
      { type: 'spoiler', attrs: { title: 'safe', open: false, onclick: 'alert(1)' }, content: [{ type: 'paragraph' }] },
      { type: 'customEmoji', attrs: { id: 2, name: 'fake', shortcode: 'fake', url: 'https://attacker.example/x.png' } },
    ];
    for (const node of badDocuments) {
      const content = ['video', 'spoiler'].includes(String(node.type)) ? [node] : [{ type: 'paragraph', content: [node] }];
      expect(() => normalizeTiptapDocument({ type: 'doc', content }, { schemaVersion: 2 })).toThrow();
    }
    expect(() => normalizeTiptapDocument({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'fontFamily', attrs: { family: 'Arial; background:url(https://bad)' } }] }] }] }, { schemaVersion: 2 })).toThrow();
    expect(() => normalizeTiptapDocument({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'fontSize', attrs: { size: '9999px' } }] }] }] }, { schemaVersion: 2 })).toThrow();
    expect(() => normalizeTiptapDocument({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'textColor', attrs: { color: 'rgb(1,2,3)' } }] }] }] }, { schemaVersion: 2 })).toThrow();
  });

  it('keeps block alignment on paragraphs and headings within the allowed values', () => {
    const document = normalizeTiptapDocument({ type: 'doc', content: [
      { type: 'paragraph', attrs: { align: 'center' }, content: [{ type: 'text', text: '居中' }] },
      { type: 'heading', attrs: { level: 2, align: 'justify' }, content: [{ type: 'text', text: '两端对齐' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '默认' }] },
    ] }, { schemaVersion: 2 });
    expect(document.content[0].attrs).toEqual({ align: 'center' });
    expect(document.content[1].attrs).toEqual({ level: 2, align: 'justify' });
    expect(document.content[2].attrs).toBeUndefined();
    const html = renderTiptapDocument(document, { schemaVersion: 2 });
    expect(html).toContain('<p data-align="center" style="text-align:center">');
    expect(html).toContain('<h2 data-align="justify" style="text-align:justify">');
    expect(html).toContain('<p>默认</p>');
    // Same shape the editor emits when the user clears the alignment.
    const cleared = normalizeTiptapDocument({ type: 'doc', content: [{ type: 'paragraph', attrs: { align: null }, content: [] }] }, { schemaVersion: 2 });
    expect(cleared.content[0].attrs).toBeUndefined();
  });

  it('rejects block alignment values and attributes the schema does not define', () => {
    for (const attrs of [{ align: 'middle' }, { align: 'CENTER' }, { align: 3 }, { align: 'center', onclick: 'alert(1)' }]) {
      expect(() => normalizeTiptapDocument({ type: 'doc', content: [{ type: 'paragraph', attrs, content: [] }] }, { schemaVersion: 2 })).toThrow();
    }
    // `justify` is a block value; cells keep their narrower set.
    expect(() => normalizeTiptapDocument({ type: 'doc', content: [{ type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', attrs: { align: 'justify' }, content: [{ type: 'paragraph' }] }] }] }] }, { schemaVersion: 2 })).toThrow();
  });

  it('caps unique mentions and reports canonical mention identities', () => {
    const content = Array.from({ length: 21 }, (_, userId) => ({ type: 'paragraph', content: [{ type: 'mention', attrs: { userId: userId + 1, username: `member_${userId + 1}` } }] }));
    expect(() => normalizeTiptapDocument({ type: 'doc', content }, { schemaVersion: 2 })).toThrow();
    const allowed = normalizeTiptapDocument({ type: 'doc', content: content.slice(0, 20) }, { schemaVersion: 2 });
    expect(collectTiptapMentionIds(allowed)).toHaveLength(20);
  });

  it('rejects inline table cells and malformed list item blocks', () => {
    expect(() => normalizeTiptapDocument({ type: 'doc', content: [{ type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'text', text: 'not a block' }] }] }] }] }, { schemaVersion: 2 })).toThrow();
    expect(() => normalizeTiptapDocument({ type: 'doc', content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'text', text: 'missing paragraph' }] }] }] }, { schemaVersion: 2 })).toThrow();
  });
});
