import { sanitizeHtmlDocument, htmlDocumentSrcDoc, htmlDocumentProjection } from './html-document.util';
import { normalizeTiptapDocument, renderTiptapDocument } from './tiptap-content.util';

const source = '<!doctype html><html><head><style>.card{--accent:#d4a23a;display:grid;grid-template-columns:1fr 1fr}.card::before{content:"＋"}@media(max-width:760px){.card{grid-template-columns:1fr}}</style></head><body><article class="card" id="catalog"><h1>标题</h1><details><summary>展开</summary><p>正文</p></details></article></body></html>';

describe('isolated HTML documents', () => {
  it('preserves stylesheets, selectors, variables and responsive layout across normalization', () => {
    const safe = sanitizeHtmlDocument(source);
    expect(safe).toContain('<style>');
    expect(safe).toContain('--accent:#d4a23a');
    expect(safe).toContain('::before');
    expect(safe).toContain('@media(max-width:760px)');
    expect(safe).toContain('class="card" id="catalog"');
    expect(safe).toContain('<details>');
    expect(sanitizeHtmlDocument(safe)).toBe(safe);
    const doc = normalizeTiptapDocument({ type: 'doc', content: [{ type: 'htmlBlock', attrs: { html: source } }] }, { schemaVersion: 2 });
    expect(doc.content[0].attrs?.html).toBe(safe);
    const projection = renderTiptapDocument(doc);
    expect(projection).toContain('<iframe');
    expect(projection).not.toContain('<style>');
    expect(projection).toContain('srcdoc="');
  });

  it('removes executable markup, navigation meta, base URL, forms and unsafe image URLs', () => {
    const safe = sanitizeHtmlDocument('<html><head><base href="https://evil.test"><meta http-equiv="refresh" content="0;url=https://evil.test"></head><body><script>alert(1)</script><iframe src="https://evil.test"></iframe><form action="/delete"><input></form><svg onload="alert(1)"></svg><img src="data:image/svg+xml;base64,AAA" onerror="alert(1)"><a href="&#106;avascript:alert(1)">x</a><p onclick="alert(1)">text</p></body></html>');
    for (const forbidden of ['<script', '<iframe', '<form', '<input', '<svg', '<meta', '<base', 'onerror=', 'onclick=', 'javascript:', 'data:']) expect(safe).not.toContain(forbidden);
    const srcdoc = htmlDocumentSrcDoc(safe);
    expect(srcdoc).toContain("script-src 'none'");
    expect(srcdoc).toContain("form-action 'none'");
    expect(srcdoc.indexOf('Content-Security-Policy')).toBeLessThan(srcdoc.indexOf('<style>'));
    expect(htmlDocumentProjection(safe)).not.toContain('allow-scripts');
  });

  it('accepts descriptions larger than the former 20K limit without truncation', () => {
    const safe = sanitizeHtmlDocument('<html><p>' + '说明'.repeat(20_000) + '</p></html>');
    expect(safe).toContain('说明'.repeat(20_000));
    expect(sanitizeHtmlDocument('<html><p>' + 'x'.repeat(200_001) + '</p></html>')).toBe('');
    expect(sanitizeHtmlDocument('<style>body{color:red}</style>')).toBe('');
  });
});
