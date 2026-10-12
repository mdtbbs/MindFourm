import { analyzeHtmlBlockDraft, sanitizeHtmlBlockDraft, sanitizeHtmlBlockPreview } from '../../frontend/src/lib/tiptap/html-block-draft';

/**
 * The typing path of the HTML block panel.
 *
 * The panel used to sanitize the whole draft on every keystroke — a full
 * parse-and-rewrite pass per character (21ms at 60KB, 63ms at 180KB). The live
 * path is now this regex scan; the sanitizer only runs when the author asks for
 * a preview or submits. These assertions pin both sides of that split.
 */
describe('HTML block draft analysis', () => {
  const bigDocument = (() => {
    let html = '<!doctype html><html><head><style>.a{display:grid}</style></head><body>';
    while (html.length < 200_000) html += '<div class="a" style="padding:16px"><h3>章节</h3><p>说明</p></div>';
    return html + '</body></html>';
  })();

  it('counts characters and classifies the draft without building a tree', () => {
    const stats = analyzeHtmlBlockDraft('<p>正文</p>');
    expect(stats.characters).toBe('<p>正文</p>'.length);
    expect(stats.isDocument).toBe(false);
    expect(stats.embeddedImages).toBe(0);
    expect(stats.remoteImages).toBe(0);
  });

  it('separates embedded from remote images so the panel can warn before submitting', () => {
    const draft = '<img src="data:image/png;base64,YWJj">'
      + '<img src="https://external.test/a.png">'
      + '<div style="background:url(//external.test/b.png)">x</div>';
    const stats = analyzeHtmlBlockDraft(draft);
    expect(stats.embeddedImages).toBe(1);
    expect(stats.remoteImages).toBe(2);
  });

  it('routes full documents to document mode', () => {
    expect(analyzeHtmlBlockDraft('<!doctype html><html><body>x</body></html>').isDocument).toBe(true);
    expect(analyzeHtmlBlockDraft('<style>.a{}</style><p>x</p>').isDocument).toBe(true);
  });

  it('is bounded in time on a document far past the editor limit', () => {
    const started = Date.now();
    for (let index = 0; index < 20; index += 1) analyzeHtmlBlockDraft(bigDocument);
    // 20 passes over ~200KB: the point is that typing never pays for a tree walk.
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('keeps the same sanitized value the submit path stores', () => {
    const draft = '<div style="padding:16px"><h3>简介</h3><script>alert(1)</script></div>';
    const stored = sanitizeHtmlBlockDraft(draft);
    expect(stored).toContain('<h3>简介</h3>');
    expect(stored).not.toContain('alert');
  });

  it('drops base64 payloads from the preview instead of sanitizing megabytes', () => {
    const payload = 'A'.repeat(600_000);
    const preview = sanitizeHtmlBlockPreview(`<img src="data:image/png;base64,${payload}"><p>说明</p>`);
    expect(preview).toContain('说明');
    expect(preview).not.toContain('base64');
  });
});
