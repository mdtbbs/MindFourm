'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { htmlDocumentSrcDoc } from '@/lib/tiptap/html-document';

/** Scripts, forms and nested documents are disabled; CSS cannot affect the forum. */
export function RichHtmlDocument({ html }: { html: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(320);
  const [loaded, setLoaded] = useState(0);
  const [theme, setTheme] = useState<{ color?: string; background?: string; font?: string }>({});
  const srcDoc = useMemo(() => htmlDocumentSrcDoc(html, theme), [html, theme]);

  useEffect(() => {
    const update = () => {
      if (!container.current) return;
      const style = getComputedStyle(container.current);
      setTheme({ color: style.color, font: style.fontFamily });
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!doc?.body) return;
    const resize = () => {
      const next = Math.min(60_000, Math.max(80, Math.ceil(doc.body.scrollHeight)));
      setHeight((previous) => previous === next ? previous : next);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(doc.body);
    // Details and images change height after the initial load.
    doc.addEventListener('load', resize, true);
    doc.addEventListener('toggle', resize, true);
    resize();
    return () => {
      observer.disconnect();
      doc.removeEventListener('load', resize, true);
      doc.removeEventListener('toggle', resize, true);
    };
  }, [loaded]);

  return <div ref={container} className="rich-html-block" data-testid="rich-html-block">
    <iframe ref={frame} title="HTML 内容" data-testid="rich-html-document"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer" srcDoc={srcDoc}
      onLoad={() => setLoaded((value) => value + 1)}
      style={{ display: 'block', width: '100%', height, border: 0 }} />
  </div>;
}
