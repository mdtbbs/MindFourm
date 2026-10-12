import { JSDOM } from 'jsdom';
import { normalizePastedRichHtml } from '../../frontend/src/lib/tiptap/paste-normalization';

/**
 * Clipboard HTML is the one place where markup the editor never wrote can enter
 * the document. These cases pin down what survives the trip.
 */
describe('pasted rich HTML normalization', () => {
  const original = globalThis.DOMParser;
  beforeAll(() => { (globalThis as any).DOMParser = new JSDOM('').window.DOMParser; });
  afterAll(() => { (globalThis as any).DOMParser = original; });

  const parse = (html: string) => new JSDOM('<body>' + normalizePastedRichHtml(html) + '</body>').window.document.body;

  it('keeps block alignment from styles, data attributes and legacy markup', () => {
    expect(parse('<p style="text-align:center">a</p>').querySelector('p')?.getAttribute('data-align')).toBe('center');
    expect(parse('<h3 data-align="justify">a</h3>').querySelector('h3')?.getAttribute('data-align')).toBe('justify');
    expect(parse('<p align="right">a</p>').querySelector('p')?.getAttribute('data-align')).toBe('right');
    expect(parse('<center><h2>a</h2></center>').querySelector('h2')?.getAttribute('data-align')).toBe('center');
  });

  it('sinks wrapper alignment onto the blocks inside, including bare-text wrappers', () => {
    const nested = parse('<div style="text-align:center"><p>one</p><p>two</p></div>');
    expect(Array.from(nested.querySelectorAll('p')).map((p) => p.getAttribute('data-align'))).toEqual(['center', 'center']);
    const bare = parse('<div style="text-align:center">bare</div>');
    expect(bare.querySelector('p')?.getAttribute('data-align')).toBe('center');
    expect(bare.textContent).toBe('bare');
    // A wrapper with no block of its own gets a paragraph, but only when it carries alignment.
    expect(parse('<div>plain</div>').querySelector('p')).toBeNull();
  });

  it('lets a cell carry its own alignment without duplicating it onto every block', () => {
    const cell = parse('<table><tbody><tr><td style="text-align:center"><p>c</p></td><td data-align="right"><p>d</p></td></tr></tbody></table>');
    const cells = Array.from(cell.querySelectorAll('td'));
    expect(cells.map((td) => td.getAttribute('data-align'))).toEqual(['center', 'right']);
    expect(cells.flatMap((td) => Array.from(td.querySelectorAll('p'))).map((p) => p.getAttribute('data-align'))).toEqual([null, null]);
    // `justify` is legal on a block but not on a cell, so it stops at the paragraph.
    const justified = parse('<table><tbody><tr><td style="text-align:justify"><p>x</p></td></tr></tbody></table>');
    expect(justified.querySelector('td')?.getAttribute('data-align')).toBeNull();
    expect(justified.querySelector('p')?.getAttribute('data-align')).toBe('justify');
  });

  it('drops everything the schema cannot represent', () => {
    const dirty = parse('<p style="text-align:center" onclick="alert(1)" class="x" id="y">dirty</p>');
    expect(dirty.querySelector('p')?.getAttribute('data-align')).toBe('center');
    expect(dirty.querySelector('p')?.outerHTML).not.toMatch(/onclick|class=|id=/);
    expect(normalizePastedRichHtml('<p style="text-align:center;position:fixed;background:url(javascript:alert(1))">mix</p>')).not.toMatch(/position|javascript|url\(/);
    expect(normalizePastedRichHtml('<script>alert(1)</script>')).toBe('');
    expect(normalizePastedRichHtml('<p style="text-align: inherit">x</p>')).not.toContain('data-align');
    // Case is normalized by the browser's own CSS parser before we read it.
    expect(normalizePastedRichHtml('<p style="TEXT-ALIGN: CENTER">x</p>')).toContain('data-align="center"');
  });

  it('keeps the inline marks the schema has and only on spans', () => {
    expect(normalizePastedRichHtml('<span style="color:#c62828">r</span>')).toContain('data-color="#C62828"');
    // 15pt rounds to a preset 20px; 14pt rounds to 19px, which is not one.
    expect(normalizePastedRichHtml('<span style="font-size:15pt">r</span>')).toContain('data-font-size="20px"');
    expect(normalizePastedRichHtml('<span style="font-size:14pt">r</span>')).not.toContain('data-font-size');
    expect(normalizePastedRichHtml('<span style="font-size:99px">r</span>')).not.toContain('data-font-size');
    expect(normalizePastedRichHtml('<span style="background-color:#FFF2CC">r</span>')).toContain('data-highlight="yellow"');
    expect(normalizePastedRichHtml('<p style="color:#c62828">r</p>')).not.toContain('data-color');
  });
});
