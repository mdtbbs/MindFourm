import { normalizeEditorLink } from './editor-link';

describe('normalizeEditorLink', () => {
  it('normalizes external domains and keeps safe same-site references', () => {
    expect(normalizeEditorLink('example.org/path?q=1')).toBe('https://example.org/path?q=1');
    expect(normalizeEditorLink('/posts/42#reply-9')).toBe('/posts/42#reply-9');
    expect(normalizeEditorLink('#section')).toBe('/#section');
    expect(normalizeEditorLink('mailto:hello@example.org')).toBe('mailto:hello@example.org');
  });

  it('rejects script protocols, protocol-relative URLs, credentials and control characters', () => {
    expect(normalizeEditorLink('javascript:alert(1)')).toBeNull();
    expect(normalizeEditorLink('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(normalizeEditorLink('//attacker.example/path')).toBeNull();
    expect(normalizeEditorLink('https://name:password@example.org')).toBeNull();
    expect(normalizeEditorLink('https://example.org/\npath')).toBeNull();
  });
});
