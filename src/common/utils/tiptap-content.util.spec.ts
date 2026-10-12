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

  describe('htmlBlock', () => {
    const block = (html: string) => ({ type: 'htmlBlock', attrs: { html } });

    it('keeps a sanitized fragment as the stored markup, and as its plain text', () => {
      const document = normalizeTiptapDocument({ type: 'doc', content: [
        block('<div style="border:1px solid #ddd;border-radius:12px;padding:16px"><h3 style="margin:0">资源简介</h3><p>说明 <a href="/posts/1">内链</a></p></div>'),
      ] }, { schemaVersion: 2 });
      const attrs = document.content[0].attrs as Record<string, string>;

      expect(attrs.html).toContain('border-radius:12px');
      expect(attrs.html).toContain('<h3 style="margin:0">资源简介</h3>');
      // The text attribute is derived server-side, so it always matches the markup.
      expect(attrs.text).toBe('资源简介 说明 内链');
    });

    it('renders the fragment into content_html instead of flattening it', () => {
      const html = '<div style="display:flex;gap:12px"><h3 style="margin:0">t</h3><p>p</p></div>';
      const rendered = renderTiptapDocument({ type: 'doc', content: [block(html)] }, { schemaVersion: 2 });

      expect(rendered).toContain('<div style="display:flex;gap:12px">');
      expect(rendered).toContain('<h3 style="margin:0">t</h3>');
      expect(rendered).not.toContain('TOKEN');
    });

    it('drops scripts, handlers and remote loads while keeping the rest of the block', () => {
      const rendered = renderTiptapDocument({ type: 'doc', content: [
        block('<div onclick="alert(1)" style="position:fixed;color:#123456;background:url(https://evil.example/x)">ok</div><script>alert(2)</script>'),
      ] }, { schemaVersion: 2 });

      expect(rendered).not.toContain('onclick');
      expect(rendered).not.toContain('position');
      expect(rendered).not.toContain('evil.example');
      expect(rendered).not.toContain('<script');
      expect(rendered).toContain('color:#123456');
      expect(rendered).toContain('ok');
    });

    it('sanitizes on the way in, so a stored document is already safe', () => {
      const document = normalizeTiptapDocument({ type: 'doc', content: [block('<p>a</p><script>alert(1)</script>')] }, { schemaVersion: 2 });
      expect((document.content[0].attrs as Record<string, string>).html).toBe('<p>a</p>');
    });

    it('replaces a client-supplied text attribute instead of trusting it', () => {
      const document = normalizeTiptapDocument({ type: 'doc', content: [
        { type: 'htmlBlock', attrs: { html: '<p>real</p>', text: 'spoofed' } },
      ] }, { schemaVersion: 2 });
      expect((document.content[0].attrs as Record<string, string>).text).toBe('real');
    });

    it('projects the block into Markdown and search text', () => {
      const source = resolveContentSource(undefined, { type: 'doc', content: [
        block('<div><h3>标题</h3><p>正文内容</p></div>'),
      ] }, 2);

      expect(source.content).toBe('标题 正文内容');
      expect(source.content_text).toBe('标题 正文内容');
      // The HTML projection is the one that keeps the markup.
      expect(source.content_html).toContain('<h3>标题</h3>');
      expect(source.content_schema_version).toBe(2);
    });

    it('uses an image-only block’s alt text so the document is not considered empty', () => {
      const source = resolveContentSource(undefined, { type: 'doc', content: [
        block('<p><img src="/uploads/banner.png" alt="活动横幅"></p>'),
      ] }, 2);

      expect(source.content).toBe('活动横幅');
    });

    it('rejects malformed blocks rather than silently dropping them', () => {
      const cases: Array<[string, Record<string, unknown>]> = [
        ['missing html', { type: 'htmlBlock', attrs: {} }],
        ['empty html', { type: 'htmlBlock', attrs: { html: '   ' } }],
        ['nothing survives sanitizing', { type: 'htmlBlock', attrs: { html: '<script>alert(1)</script>' } }],
        ['unknown attribute', { type: 'htmlBlock', attrs: { html: '<p>x</p>', onclick: 'alert(1)' } }],
        ['block content', { type: 'htmlBlock', attrs: { html: '<p>x</p>' }, content: [{ type: 'text', text: 'x' }] }],
      ];
      for (const [name, node] of cases) {
        expect([name, () => normalizeTiptapDocument({ type: 'doc', content: [node] }, { schemaVersion: 2 })]).toEqual([name, expect.any(Function)]);
        expect(() => normalizeTiptapDocument({ type: 'doc', content: [node] }, { schemaVersion: 2 })).toThrow();
      }
    });

    it('requires Schema v2', () => {
      expect(() => normalizeTiptapDocument({ type: 'doc', content: [block('<p>x</p>')] })).toThrow(/Rich Content Schema v2/);
    });

    it('limits how many blocks one document may carry', () => {
      const many = Array.from({ length: 6 }, () => block('<p>x</p>'));
      expect(() => normalizeTiptapDocument({ type: 'doc', content: many }, { schemaVersion: 2 })).toThrow(/数量超出限制/);
      expect(() => normalizeTiptapDocument({ type: 'doc', content: many.slice(0, 5) }, { schemaVersion: 2 })).not.toThrow();
    });

    it('is accepted inside the same containers as other atom blocks', () => {
      for (const node of [
        { type: 'blockquote', content: [block('<p>x</p>')] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }, block('<p>x</p>')] }] },
        { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph' }, block('<p>x</p>')] }] }] },
        { type: 'spoiler', attrs: { title: 'x', open: false }, content: [{ type: 'paragraph' }, block('<p>x</p>')] },
      ]) {
        expect(() => normalizeTiptapDocument({ type: 'doc', content: [node] }, { schemaVersion: 2 })).not.toThrow();
      }
    });
  });
});
