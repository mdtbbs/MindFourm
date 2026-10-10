import { escapeMarkdownText, validateHandlebarsTemplate } from './email-template.util';

describe('validateHandlebarsTemplate', () => {
  it('accepts a well-formed template', () => {
    expect(() => validateHandlebarsTemplate('<p>Hi {{username}}</p>')).not.toThrow();
  });

  it('rejects a malformed template before it can reach a send path', () => {
    expect(() => validateHandlebarsTemplate('{{#if user}}missing end')).toThrow();
    expect(() => validateHandlebarsTemplate('{{unclosed')).toThrow();
  });
});

describe('escapeMarkdownText', () => {
  it('escapes markdown control characters', () => {
    expect(escapeMarkdownText('# heading')).toBe('\\# heading');
    expect(escapeMarkdownText('**bold**')).toBe('\\*\\*bold\\*\\*');
  });

  it('escapes links and brackets so usernames cannot forge structure', () => {
    expect(escapeMarkdownText('[click](http://evil.example)')).toBe(
      '\\[click\\]\\(http://evil\\.example\\)',
    );
  });

  it('leaves plain text and non-ASCII alone', () => {
    expect(escapeMarkdownText('你好 world 123')).toBe('你好 world 123');
  });

  it('handles the empty string', () => {
    expect(escapeMarkdownText('')).toBe('');
  });
});
