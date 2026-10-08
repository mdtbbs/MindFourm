import { cssStyle, textColorStyle, highlightStyle, fontSizeStyle, fontFamilyStyle } from '../../frontend/src/lib/tiptap/presentation';
import { safeUrl, safeVideoEmbed } from '../../frontend/src/lib/tiptap/presentation-url';

describe('Schema v2 presentation allowlists', () => {
  it('renders the same bounded styles for reader and editor without arbitrary CSS', () => {
    expect(cssStyle(textColorStyle('#336699'))).toBe('color: #336699');
    expect(cssStyle(highlightStyle('yellow'))).toBe('background-color: #FFF2CC');
    expect(cssStyle(fontSizeStyle('18px'))).toBe('font-size: 18px');
    expect(fontFamilyStyle('serif-cn')).toEqual({ fontFamily: '"Songti SC", SimSun, serif' });
    expect(textColorStyle('red; background: url(javascript:alert(1))')).toEqual({});
    expect(highlightStyle('url(javascript:alert(1))')).toEqual({});
    expect(fontSizeStyle('999px')).toEqual({});
    expect(fontFamilyStyle('evil')).toEqual({});
  });
  it('preserves URL and video provider restrictions for shared cards', () => {
    for (const url of ['javascript:alert(1)', '//evil.invalid', '/a/../b', 'data:text/html,x', 'https:\\evil.invalid']) expect(safeUrl(url, true)).toBeNull();
    expect(safeUrl('/favicon.ico', true)).toBe('/favicon.ico');
    expect(safeVideoEmbed({ attrs: { provider: 'untrusted', videoId: 'BV1xx411c7mD' } })).toBeNull();
    expect(safeVideoEmbed({ attrs: { provider: 'bilibili', videoId: '<script>' } })).toBeNull();
    expect(safeVideoEmbed({ attrs: { provider: 'bilibili', videoId: 'BV1xx411c7mD' } })).toMatch(/^https:\/\/player\.bilibili\.com\//);
  });
});
