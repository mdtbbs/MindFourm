import { escapeHtml } from './escape-html.util';

describe('escapeHtml', () => {
  it('escapes the characters that can break out of HTML context', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
    expect(escapeHtml('a & b')).toBe('a &amp; b');
    expect(escapeHtml('say "hi"')).toBe('say &quot;hi&quot;');
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('escapes attribute-breaking input', () => {
    // A username like this was substituted straight into the email templates.
    expect(escapeHtml('" onmouseover="alert(1)')).toBe(
      '&quot; onmouseover=&quot;alert(1)',
    );
  });

  it('escapes ampersands before the entities it introduces', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('leaves ordinary text alone, including CJK', () => {
    expect(escapeHtml('普通用户名')).toBe('普通用户名');
    expect(escapeHtml('')).toBe('');
  });
});
