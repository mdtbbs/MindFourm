import { RoleName } from './constants';
import {
  TRUSTED_HTML_MAX_BLOCKS,
  TRUSTED_HTML_MAX_LENGTH,
  assertHtmlBlockPermission,
  documentContainsHtmlBlocks,
  roleAllowsHtmlBlocks,
  sanitizeTrustedHtml,
  trustedHtmlToText,
} from './trusted-html.util';

/**
 * The block is the one place a document keeps markup verbatim, so these tests are
 * written as attacks first and features second: every "keeps" case is paired with
 * the reason it is safe to keep.
 */
describe('sanitizeTrustedHtml', () => {
  it('keeps layout a resource description is written for', () => {
    const card = '<div style="display:flex;gap:16px;border:1px solid #e5e7eb;border-radius:12px;padding:16px;background-color:#f9fafb">'
      + '<div style="flex:1"><h3 style="margin:0 0 8px;color:#111827">资源简介</h3><p style="margin:0">说明文字</p></div>'
      + '<img src="/uploads/cover.png" alt="封面" style="width:240px;border-radius:8px"></div>';
    const result = sanitizeTrustedHtml(card);

    for (const fragment of ['display:flex', 'gap:16px', 'border-radius:12px', 'padding:16px', 'flex:1', 'margin:0 0 8px', 'color:#111827', 'width:240px']) {
      expect(result).toContain(fragment);
    }
    expect(result).toContain('src="/uploads/cover.png"');
    expect(result).toContain('<h3');
  });

  it('keeps headings, lists, tables and figures', () => {
    const result = sanitizeTrustedHtml('<section><h2>标题</h2><ul><li>一项</li></ul>'
      + '<table><thead><tr><th colspan="2">表头</th></tr></thead><tbody><tr><td>单元格</td></tr></tbody></table>'
      + '<figure><img src="/a.png"><figcaption>图注</figcaption></figure></section>');

    expect(result).toContain('<h2>标题</h2>');
    expect(result).toContain('<li>一项</li>');
    expect(result).toContain('<th colspan="2">表头</th>');
    expect(result).toContain('<figcaption>图注</figcaption>');
  });

  it('drops scripts and retains styles only as an isolated document', () => {
    const result = sanitizeTrustedHtml('<p>before</p><script>alert(document.cookie)</script><style>body{display:none}</style><p>after</p>');

    expect(result).not.toContain('script');
    expect(result).not.toContain('alert');
    expect(result).toContain('<style>body{display:none}</style>');
    expect(result).toMatch(/^<!doctype html>/);
    expect(result).toContain('before');
    expect(result).toContain('after');
  });

  it('drops embedded documents and their fallback contents', () => {
    for (const html of [
      '<iframe src="https://evil.example">fallback</iframe>',
      '<object data="https://evil.example">fallback</object>',
      '<embed src="https://evil.example">',
      '<template><img src=x onerror=alert(1)></template>',
    ]) {
      const result = sanitizeTrustedHtml(html);
      expect(result).not.toContain('evil.example');
      expect(result).not.toContain('onerror');
      expect(result).not.toContain('fallback');
    }
  });

  it('strips every event handler and unknown attribute', () => {
    const result = sanitizeTrustedHtml('<div onclick="alert(1)" onmouseover="alert(2)" data-track="x" id="y">text</div>');

    expect(result).not.toContain('onclick');
    expect(result).not.toContain('onmouseover');
    expect(result).not.toContain('data-track');
    expect(result).not.toContain('id=');
    expect(result).toContain('text');
  });

  it('rejects javascript: URLs on both href and src, including encoded forms', () => {
    for (const html of [
      '<a href="javascript:alert(1)">x</a>',
      '<a href="JaVaScRiPt:alert(1)">x</a>',
      '<a href="&#106;avascript:alert(1)">x</a>',
      '<img src="javascript:alert(1)">',
    ]) {
      expect(sanitizeTrustedHtml(html)).not.toContain('alert');
    }
  });

  it('rejects data: URLs and protocol-relative hosts', () => {
    expect(sanitizeTrustedHtml('<img src="data:text/html;base64,PHNjcmlwdD4=">')).not.toContain('base64');
    expect(sanitizeTrustedHtml('<img src="//evil.example/x.png">')).not.toContain('evil.example');
  });

  it('drops style values that can cover the page or load a remote resource', () => {
    // Each of these is a distinct escape route: overlay the site, fetch on render,
    // run script through a legacy expression, or claim the viewport.
    const result = sanitizeTrustedHtml('<div style="position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9999;'
      + 'background:url(https://evil.example/x.png);width:expression(alert(1));color:#ff0000">overlay</div>');

    expect(result).not.toContain('position');
    expect(result).not.toContain('z-index');
    expect(result).not.toContain('url(');
    expect(result).not.toContain('expression');
    expect(result).not.toContain('100vw');
    // The legitimate declaration in the same attribute still survives.
    expect(result).toContain('color:#ff0000');
  });

  it('drops !important so a fragment cannot outrank the site theme', () => {
    expect(sanitizeTrustedHtml('<div style="color:#ff0000 !important">x</div>')).not.toContain('!important');
    expect(sanitizeTrustedHtml('<div style="color:#ff0000!important">x</div>')).not.toContain('important');
  });

  it('drops unknown properties and custom properties', () => {
    const result = sanitizeTrustedHtml('<div style="color:red;--brand:1;behavior:url(#x);position:absolute;cursor:pointer">x</div>');

    expect(result).toContain('color:red');
    expect(result).not.toContain('--brand');
    expect(result).not.toContain('behavior');
    expect(result).not.toContain('cursor');
  });

  it('refuses values that try to break out of the style attribute', () => {
    const result = sanitizeTrustedHtml('<div style="color:red;background:url(javascript:alert(1));color:expression(alert(2))">x</div>');

    expect(result).not.toContain('javascript');
    expect(result).not.toContain('expression');
    expect(result).toContain('color:red');
  });

  it('keeps gradients without letting them carry a url()', () => {
    expect(sanitizeTrustedHtml('<div style="background-image:linear-gradient(90deg,#ff0000,#00ff00)">x</div>'))
      .toContain('linear-gradient(90deg,#ff0000,#00ff00)');
    expect(sanitizeTrustedHtml('<div style="background-image:linear-gradient(90deg,url(https://evil.example/x))">x</div>'))
      .not.toContain('evil.example');
  });

  it('adds rel/target to links and lazy loading to images', () => {
    const link = sanitizeTrustedHtml('<a href="https://example.com/a">外链</a>');
    expect(link).toContain('rel="nofollow noopener noreferrer"');
    expect(link).toContain('target="_blank"');

    // A same-site link stays in the tab: the reader is not thrown out of the app.
    expect(sanitizeTrustedHtml('<a href="/posts/1">站内</a>')).not.toContain('target="_blank"');

    const image = sanitizeTrustedHtml('<img src="/uploads/a.png" alt="图">');
    expect(image).toContain('loading="lazy"');
    expect(image).toContain('decoding="async"');
  });

  it('bounds the fragment length', () => {
    const long = '<p>' + 'x'.repeat(TRUSTED_HTML_MAX_LENGTH * 2) + '</p>';
    expect(sanitizeTrustedHtml(long).length).toBeLessThanOrEqual(TRUSTED_HTML_MAX_LENGTH + 32);
  });

  it('is idempotent, so re-sanitizing a stored block is a no-op', () => {
    const samples = [
      '<div style="border:1px solid #ddd;border-radius:12px;padding:16px"><h3 style="margin:0">t</h3><p>p</p></div>',
      '<p><img src="/uploads/a.png" alt="图" width="400" height="300"></p>',
      '<a href="/posts/1">内链</a>',
      '<table><tbody><tr><td colspan="2" style="text-align:center">c</td></tr></tbody></table>',
      '<div style="display:flex;gap:8px"><div style="flex:1">a</div></div>',
    ];
    for (const sample of samples) {
      const once = sanitizeTrustedHtml(sample);
      expect(sanitizeTrustedHtml(once)).toBe(once);
    }
  });

  it('returns an empty string for input without anything to keep', () => {
    expect(sanitizeTrustedHtml('')).toBe('');
    expect(sanitizeTrustedHtml('   ')).toBe('');
    expect(sanitizeTrustedHtml('<script>alert(1)</script>')).toBe('');
  });
});

describe('trustedHtmlToText', () => {
  it('produces the plain-text projection', () => {
    expect(trustedHtmlToText('<div><h3>资源简介</h3><p>说明 <strong>文字</strong></p></div>')).toBe('资源简介 说明 文字');
  });

  it('does not leak script or style contents into search text', () => {
    expect(trustedHtmlToText('<p>正文</p><script>var secret = 1;</script><style>.a{color:red}</style>')).toBe('正文');
  });
});

describe('roleAllowsHtmlBlocks', () => {
  it('allows the management team and nobody below it', () => {
    for (const role of ['moderator', 'admin', 'super_admin'] as RoleName[]) expect(roleAllowsHtmlBlocks(role)).toBe(true);
    for (const role of ['guest', 'user']) expect(roleAllowsHtmlBlocks(role)).toBe(false);
    expect(roleAllowsHtmlBlocks(null)).toBe(false);
    expect(roleAllowsHtmlBlocks(undefined)).toBe(false);
    expect(roleAllowsHtmlBlocks('not-a-role')).toBe(false);
  });
});

describe('documentContainsHtmlBlocks', () => {
  it('finds a block anywhere in the document', () => {
    expect(documentContainsHtmlBlocks({ type: 'doc', content: [{ type: 'htmlBlock', attrs: { html: '<p>x</p>' } }] })).toBe(true);
    expect(documentContainsHtmlBlocks({ type: 'doc', content: [
      { type: 'blockquote', content: [{ type: 'htmlBlock', attrs: { html: '<p>x</p>' } }] },
    ] })).toBe(true);
    expect(documentContainsHtmlBlocks({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe(false);
    expect(documentContainsHtmlBlocks(null)).toBe(false);
    expect(documentContainsHtmlBlocks('doc')).toBe(false);
  });
});

describe('assertHtmlBlockPermission', () => {
  const document = { type: 'doc', content: [{ type: 'htmlBlock', attrs: { html: '<p>x</p>' } }] };

  it('lets the management team through', () => {
    for (const role of ['moderator', 'admin', 'super_admin']) expect(() => assertHtmlBlockPermission(document, role)).not.toThrow();
  });

  it('refuses an ordinary member, and says which code to expect', () => {
    expect(() => assertHtmlBlockPermission(document, 'user')).toThrow(/HTML 区块仅限管理团队使用/);
    expect(() => assertHtmlBlockPermission(document, null)).toThrow(/HTML 区块仅限管理团队使用/);
    try {
      assertHtmlBlockPermission(document, 'user');
    } catch (error) {
      // The client keys off `code`, so it has to be part of the response body.
      expect((error as any).getResponse()).toMatchObject({ code: 'HTML_BLOCK_FORBIDDEN' });
    }
  });

  it('leaves a document without blocks alone, whatever the role', () => {
    const plain = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }] };
    expect(() => assertHtmlBlockPermission(plain, 'guest')).not.toThrow();
    expect(() => assertHtmlBlockPermission(undefined, 'user')).not.toThrow();
  });

  it('counts a block hidden in a nested container', () => {
    const nested = { type: 'doc', content: [{ type: 'table', content: [{ type: 'tableRow', content: [
      { type: 'tableCell', content: [{ type: 'htmlBlock', attrs: { html: '<p>x</p>' } }] },
    ] }] }] };
    expect(() => assertHtmlBlockPermission(nested, 'user')).toThrow();
  });
});

describe('TRUSTED_HTML_MAX_BLOCKS', () => {
  it('stays small enough to bound a document', () => {
    expect(TRUSTED_HTML_MAX_BLOCKS).toBeGreaterThan(0);
    expect(TRUSTED_HTML_MAX_BLOCKS).toBeLessThanOrEqual(10);
  });
});
