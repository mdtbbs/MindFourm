import { parseMarkdown, sanitize } from './markdown.util';

describe('markdown.util', () => {
  describe('sanitize', () => {
    it('drops script tags together with their contents', () => {
      const result = sanitize('<p>before</p><script>alert(1)</script><p>after</p>');

      expect(result).not.toContain('script');
      expect(result).not.toContain('alert(1)');
      expect(result).toContain('before');
      expect(result).toContain('after');
    });

    it('strips event handlers whether or not the attribute value is quoted', () => {
      // The previous regex-based sanitizer only matched quoted handlers, so the
      // unquoted form survived.
      expect(sanitize('<img src=x onerror=alert(1)>')).not.toContain('onerror');
      expect(sanitize('<img src="x" onerror="alert(1)">')).not.toContain('onerror');
      expect(sanitize('<img src=x onerror=alert(1)>')).not.toContain('alert');
    });

    it('rejects javascript: URLs including entity-encoded variants', () => {
      expect(sanitize('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript');
      expect(sanitize('<a href="JaVaScRiPt:alert(1)">x</a>')).not.toContain('alert');
      // Entities are decoded before the scheme check, so this no longer slips past.
      expect(sanitize('<a href="&#106;avascript:alert(1)">x</a>')).not.toContain('alert');
      expect(sanitize('<a href="java&#09;script:alert(1)">x</a>')).not.toContain('alert');
    });

    it('rejects data: URLs on both href and src', () => {
      expect(sanitize('<a href="data:text/html,<script>alert(1)</script>">x</a>')).not.toContain('data:');
      expect(sanitize('<img src="data:text/html,x">')).not.toContain('data:');
    });

    it('rejects protocol-relative URLs', () => {
      expect(sanitize('<img src="//evil.example.com/x.png">')).not.toContain('evil.example.com');
    });

    it('keeps allowed markup and adds link hardening', () => {
      const result = sanitize('<p><strong>bold</strong> <a href="https://example.com">link</a></p>');

      expect(result).toContain('<strong>bold</strong>');
      expect(result).toContain('href="https://example.com"');
      expect(result).toContain('rel="nofollow noopener noreferrer"');
      expect(result).toContain('target="_blank"');
    });

    it('strips tags that are not on the allowlist but keeps their text', () => {
      const result = sanitize('<p>keep <iframe src="https://evil.example.com"></iframe><form><button>x</button></form>me</p>');

      expect(result).not.toContain('iframe');
      expect(result).not.toContain('<form');
      expect(result).not.toContain('<button');
      expect(result).toContain('keep');
      expect(result).toContain('me');
    });

    it('neutralises inputs that are not task-list checkboxes', () => {
      const result = sanitize('<input type="text" formaction="https://evil.example.com" autofocus onfocus="alert(1)">');

      expect(result).not.toContain('formaction');
      expect(result).not.toContain('onfocus');
      expect(result).not.toContain('autofocus');
      expect(result).toContain('type="hidden"');
    });

    it('drops style tags and inline styles', () => {
      expect(sanitize('<style>body{display:none}</style>')).not.toContain('display:none');
      expect(sanitize('<p style="position:fixed;top:0">x</p>')).not.toContain('position');
    });

    it('does not allow svg-based script execution', () => {
      const result = sanitize('<svg><animate onbegin="alert(1)" attributeName="x"></animate></svg>');

      expect(result).not.toContain('onbegin');
      expect(result).not.toContain('svg');
    });
  });

  describe('parseMarkdown', () => {
    it('renders standard markdown', () => {
      const result = parseMarkdown('# Title\n\nSome **bold** text.');

      expect(result).toContain('<h1>Title</h1>');
      expect(result).toContain('<strong>bold</strong>');
    });

    it('renders fenced code blocks with their language class intact', () => {
      const result = parseMarkdown('```js\nconst a = 1;\n```');

      expect(result).toContain('<pre>');
      expect(result).toContain('class="language-js"');
      expect(result).toContain('const a = 1;');
    });

    it('renders GFM tables and task lists', () => {
      const table = parseMarkdown('| a | b |\n| - | - |\n| 1 | 2 |');
      expect(table).toContain('<table>');
      expect(table).toContain('<td>1</td>');

      const tasks = parseMarkdown('- [x] done\n- [ ] todo');
      expect(tasks).toContain('type="checkbox"');
      expect(tasks).toContain('disabled');
    });

    it('sanitizes raw HTML embedded in markdown', () => {
      const result = parseMarkdown('Hello\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');

      expect(result).not.toContain('alert');
      expect(result).not.toContain('onerror');
      expect(result).toContain('Hello');
    });

    it('does not turn a bare markdown link with a javascript scheme into a live link', () => {
      const result = parseMarkdown('[click](javascript:alert(1))');

      expect(result).not.toContain('javascript');
      expect(result).not.toContain('alert');
    });
  });
});
