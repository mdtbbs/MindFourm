/**
 * The code block used to import `lowlight/common` (highlight.js grammars plus the
 * parser, ~166 KB of the JS behind every post and resource page) at module scope,
 * so a page paid for the grammars whether or not it rendered a code block. It now
 * loads the highlighter on first use.
 *
 * Rendered with `react-dom/server` rather than a DOM harness: the root Jest setup
 * is a node environment and the interactive half (the effect that resolves the
 * highlighter) can be exercised without one by checking that a code block is
 * usable synchronously and adds no highlighter weight to the initial markup.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { RichCodeBlock } from '@/components/rich-content/rich-code-block';

describe('RichCodeBlock', () => {
  it('renders the source text without waiting for the highlighter', () => {
    const html = renderToStaticMarkup(
      <RichCodeBlock language="ts" text="const schemaVersion = 2;" />,
    );

    expect(html).toContain('const schemaVersion = 2;');
    expect(html).toContain('class="language-ts"');
  });

  it('does not emit highlight.js token markup on the server render', () => {
    const html = renderToStaticMarkup(
      <RichCodeBlock language="ts" text="const schemaVersion = 2;" />,
    );

    // highlight.js wraps tokens in `hljs-`-prefixed spans. Producing those here
    // would mean the grammars were back on the server-rendered path.
    expect(html).not.toContain('hljs-');
  });

  it('keeps the language class but skips grammar loading for plain text', () => {
    // `plaintext` / `no-highlight` match highlight.js's own no-highlight pattern.
    // The class stays so styling still applies; only the grammar load is skipped,
    // which is what the interactivity test below relies on.
    const html = renderToStaticMarkup(
      <RichCodeBlock language="plaintext" text="not code at all" />,
    );

    expect(html).toContain('not code at all');
    expect(html).toContain('class="language-plaintext"');
    expect(html).not.toContain('hljs-');
  });

  it('treats no-highlight as a plain block too', () => {
    const html = renderToStaticMarkup(
      <RichCodeBlock language="no-highlight" text="verbatim output" />,
    );

    expect(html).toContain('verbatim output');
    expect(html).not.toContain('hljs-');
  });

  it('escapes source text rather than injecting markup', () => {
    const html = renderToStaticMarkup(
      <RichCodeBlock language="html" text={'<script>alert(1)</script>'} />,
    );

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
