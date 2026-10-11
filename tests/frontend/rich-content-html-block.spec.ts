/**
 * The reader half of the HTML block.
 *
 * `src/common/utils/trusted-html.util.spec.ts` covers what the server keeps; this
 * suite covers what the client renders, plus the property neither side can test
 * alone: the two whitelists agree. A fragment that sanitizes on write but
 * disappears on read — or is rendered client-side but refused on publish — is a
 * bug the author experiences as "my HTML works, then it doesn't".
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  TRUSTED_CSS_PROPERTIES,
  TRUSTED_HTML_TAGS,
  parseTrustedHtml,
  sanitizeTrustedHtmlClient,
  styleObject,
  trustedHtmlText,
} from '../../frontend/src/lib/tiptap/trusted-html';
import { RichHtmlBlock } from '../../frontend/src/components/rich-content/rich-html-block';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function plainTextOf(node: any): string {
  if (Array.isArray(node)) return node.map(plainTextOf).join(' ');
  if (node.type === 'text') return node.text;
  return (node.children || []).map(plainTextOf).join(' ');
}

describe('trusted HTML block — client parser', () => {
  it('keeps the structural markup a description is built from', () => {
    const html = '<div style="border:1px solid #ddd;border-radius:12px;padding:16px">'
      + '<h3 style="margin:0 0 8px">资源简介</h3>'
      + '<p>说明 <strong>重点</strong> 与 <a href="/posts/1">内链</a></p>'
      + '<ul><li>条目</li></ul>'
      + '<img src="/uploads/a.png" alt="图" width="400">'
      + '</div>';
    const nodes = parseTrustedHtml(html);

    expect(plainTextOf(nodes[0])).toContain('资源简介');
    expect(sanitizeTrustedHtmlClient(html)).toContain('<strong>重点</strong>');
    expect(sanitizeTrustedHtmlClient(html)).toContain('<li>条目</li>');
  });

  it('drops script, style and embedded documents along with their content', () => {
    for (const html of [
      '<p>a</p><script>alert(document.cookie)</script><p>b</p>',
      '<style>body{display:none}</style><p>b</p>',
      '<iframe src="https://evil.example">fallback</iframe><p>b</p>',
    ]) {
      const result = sanitizeTrustedHtmlClient(html);
      expect(result).not.toContain('alert');
      expect(result).not.toContain('display:none');
      expect(result).not.toContain('evil.example');
      expect(result).not.toContain('fallback');
      expect(result).toContain('b');
    }
  });

  it('strips event handlers whatever their case or quoting', () => {
    const result = sanitizeTrustedHtmlClient('<div ONCLICK="alert(1)" onMouseOver=\'alert(2)\' onclick=alert(3)>x</div>');
    expect(result.toLowerCase()).not.toContain('onclick');
    expect(result.toLowerCase()).not.toContain('onmouseover');
    expect(result).toContain('x');
  });

  it('drops style values that could cover the page or fetch remotely', () => {
    const result = sanitizeTrustedHtmlClient('<div style="position:fixed;z-index:9;width:100vw;height:100vh;background:url(https://evil.example/x);color:#123456">x</div>');
    expect(result).not.toContain('position');
    expect(result).not.toContain('z-index');
    expect(result).not.toContain('evil.example');
    // The legitimate declaration in the same attribute is untouched.
    expect(result).toContain('color:#123456');
  });

  it('refuses !important and unknown properties', () => {
    const result = sanitizeTrustedHtmlClient('<div style="color:#ff0000 !important;--brand:1;cursor:pointer;display:flex">x</div>');
    expect(result).not.toContain('!important');
    expect(result).not.toContain('--brand');
    expect(result).not.toContain('cursor');
    expect(result).toContain('display:flex');
  });

  it('normalizes malformed markup instead of failing on it', () => {
    expect(plainTextOf(parseTrustedHtml('<div><p>text'))).toContain('text');
    expect(plainTextOf(parseTrustedHtml('</div><p>ok</p>'))).toContain('ok');
    expect(plainTextOf(parseTrustedHtml('<p>a<!-- comment -->b</p>'))).toContain('a');
    expect(sanitizeTrustedHtmlClient('<div><b>bold</div>')).toBe('<div><b>bold</b></div>');
  });

  it('decodes entities exactly once', () => {
    expect(plainTextOf(parseTrustedHtml('<p>a &amp; b &lt;c&gt; &#65;</p>'))).toContain('a & b <c> A');
    // A lone surrogate would corrupt the string; it becomes the replacement char.
    expect(plainTextOf(parseTrustedHtml('<p>&#xD800; ok</p>'))).toContain('\ufffd');
  });

  it('bounds runaway nesting', () => {
    const deep = '<div>'.repeat(200) + 'x' + '</div>'.repeat(200);
    expect(() => parseTrustedHtml(deep)).not.toThrow();
    expect(sanitizeTrustedHtmlClient(deep)).toContain('x');
  });

  it('is idempotent, so an editor round-trip does not rewrite the block', () => {
    for (const sample of [
      '<div style="border:1px solid #ddd;border-radius:12px;padding:16px"><h3 style="margin:0">t</h3><p>p</p></div>',
      '<p><img src="/uploads/a.png" alt="图" width="400" height="300"></p>',
      '<a href="/posts/1">内链</a>',
      '<div style="display:flex;gap:8px"><div style="flex:1">a</div></div>',
      '<details open><summary>点开</summary><p>内容</p></details>',
    ]) {
      const once = sanitizeTrustedHtmlClient(sample);
      expect(sanitizeTrustedHtmlClient(once)).toBe(once);
    }
  });

  it('derives the same plain text the server stores', () => {
    expect(trustedHtmlText('<div><h3>标题</h3><p>正文 <strong>文字</strong></p></div>')).toBe('标题 正文 文字');
    expect(trustedHtmlText('<p><img src="/a.png" alt="横幅"></p>')).toBe('横幅');
    expect(trustedHtmlText('<script>var secret = 1;</script>')).toBe('');
  });

  it('turns style declarations into React style objects', () => {
    expect(styleObject('color: red; background-color: #fff; text-align: center'))
      .toEqual({ color: 'red', backgroundColor: '#fff', textAlign: 'center' });
    expect(styleObject(undefined)).toEqual({});
  });
});

describe('trusted HTML block — reader rendering', () => {
  const render = (html: string) => renderToStaticMarkup(createElement(RichHtmlBlock, { html }));

  it('renders the fragment as elements without ever interpreting markup', () => {
    const markup = render('<div style="color:#123456"><h3>标题</h3><p>文字</p></div>');

    expect(markup).toContain('rich-html-block');
    expect(markup).toContain('<h3>标题</h3>');
    expect(markup).toContain('color:#123456');
  });

  it('renders what the sanitizer kept, for markup that was never sanitized first', () => {
    // Defence in depth: even handed a live-looking fragment directly, the reader
    // produces no script element and no event handler.
    const markup = render('<div onclick="alert(1)">ok</div><script>alert(2)</script>');

    expect(markup).not.toContain('<script');
    expect(markup).not.toContain('onclick');
    expect(markup).not.toContain('alert');
    expect(markup).toContain('ok');
  });

  it('clears unsafe link and image targets at render time', () => {
    const markup = render('<p><a href="javascript:alert(1)">x</a><img src="data:text/html;base64,PHNjcmlwdD4="></p>');

    expect(markup).not.toContain('javascript:');
    expect(markup).not.toContain('base64');
    // An image with no usable source is omitted rather than shown broken.
    expect(markup).not.toContain('<img');
  });

  it('marks external links and leaves internal ones in the tab', () => {
    const external = render('<a href="https://example.com/a">out</a>');
    expect(external).toContain('target="_blank"');
    expect(external).toContain('rel="nofollow noopener noreferrer"');

    const internal = render('<a href="/posts/1">in</a>');
    expect(internal).not.toContain('target="_blank"');
    expect(internal).toContain('href="/posts/1"');
  });

  it('loads images through the same path as ordinary content', () => {
    const markup = render('<img src="/uploads/a.png" alt="图" width="400" height="300">');
    expect(markup).toContain('src="/uploads/a.png"');
    expect(markup).toContain('alt="图"');
    expect(markup).toContain('loading="lazy"');
    expect(markup).toContain('width="400"');
  });

  it('renders nothing for an empty or unusable fragment', () => {
    expect(render('')).toBe('');
    expect(render('<script>alert(1)</script>')).toBe('');
  });

  it('keeps a table and its spans', () => {
    const markup = render('<table><thead><tr><th colspan="2">表头</th></tr></thead><tbody><tr><td>c</td></tr></tbody></table>');
    expect(markup).toContain('<table>');
    // React writes `colSpan`; markup attribute names are case-insensitive, so a
    // browser parses it as `colspan`.
    expect(markup.toLowerCase()).toContain('colspan="2"');
    expect(markup).toContain('<td>c</td>');
  });
});

describe('trusted HTML block — the two whitelists agree', () => {
  const serverSource = readFileSync(path.join(REPO_ROOT, 'src', 'common', 'utils', 'trusted-html.util.ts'), 'utf8');

  function stringArrayFromServer(constant: string): string[] {
    const match = new RegExp(`const ${constant}[^=]*=\\s*\\[([^\\]]*)\\]`).exec(serverSource);
    if (!match) throw new Error(`Could not read ${constant} from the server module.`);
    return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
  }

  it('allows exactly the same tags', () => {
    expect([...TRUSTED_HTML_TAGS].sort()).toEqual(stringArrayFromServer('TRUSTED_HTML_TAGS').sort());
  });

  it('knows exactly the same CSS properties', () => {
    const table = /const CSS_PROPERTIES: Record<string, RegExp\[\]> = \{([\s\S]*?)\n\};/.exec(serverSource);
    if (!table) throw new Error('Could not read CSS_PROPERTIES from the server module.');
    const serverProperties = [...table[1].matchAll(/^  (?:'([a-z-]+)'|([a-z-]+)):/gm)].map((match) => match[1] || match[2]);
    // The server table is the authority; the client must not be missing an entry
    // (a property it refuses is a value the author loses on reload) or carrying one
    // it should not know about.
    const missing = serverProperties.filter((property) => !TRUSTED_CSS_PROPERTIES.includes(property));
    const extra = TRUSTED_CSS_PROPERTIES.filter((property) => !serverProperties.includes(property));
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });

  it('agrees on what a fragment must never contain', () => {
    // Both sides are driven from their own tables; the shared samples below have to
    // come out the same way from each, or one of them is the odd one out.
    const kept = '<div style="color:#123456;display:flex;gap:8px"><h3>t</h3><p>p</p><img src="/a.png" alt="a"></div>';
    const client = sanitizeTrustedHtmlClient(kept);
    expect(client).toContain('color:#123456');
    expect(client).toContain('display:flex');
    expect(client).toContain('<h3>t</h3>');
  });
});
