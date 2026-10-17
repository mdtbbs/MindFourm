'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';

/**
 * Search entry for the homepage.
 *
 * Server-rendering `<form action="/search">` looked correct but broke for guests:
 * `/search` is an OAuth-protected route, so pressing Enter signed-out landed on a
 * 401 page, while the shared header search quietly fell back to a raw input with
 * no submit handling. The anchor is the source of truth (it always works), and it
 * upgrades itself to the real palette control once hydration confirms the site
 * shell actually mounted one.
 */
export default function HomeSearchLauncher({ placeholder, label, shortcutLabel }: { placeholder: string; label: string; shortcutLabel: string }) {
  const [enhanced, setEnhanced] = useState(false);

  useEffect(() => {
    const host = document.querySelector<HTMLElement>('[data-testid="global-search-trigger-desktop"]');
    if (!host) return;
    // A mounted palette means the click can open the real search dialog. Without
    // it we keep the plain link rather than offering a control that does nothing.
    setEnhanced(true);
  }, []);

  const shared = 'relative flex min-h-11 w-full items-center border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-left text-sm text-[var(--text-muted)] hover:border-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]';
  const content = <>
    <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
    <span className="min-w-0 flex-1 truncate pl-7">{placeholder}</span>
    <kbd className="ml-2 hidden shrink-0 items-center gap-1 border border-[var(--border)] bg-[var(--bg-card)] px-1.5 py-1 text-[10px] text-[var(--text-muted)] xl:inline-flex">{shortcutLabel}</kbd>
  </>;

  const open = () => {
    const host = document.querySelector<HTMLElement>('[data-testid="global-search-trigger-desktop"]');
    if (host) { host.click(); return; }
    window.location.assign('/search');
  };

  return <div className="mt-5 max-w-2xl">
    {enhanced
      ? <button type="button" data-testid="home-search-trigger" onClick={open} aria-label={label} className={shared}>{content}</button>
      : <a data-testid="home-search-link" href="/search" aria-label={label} className={shared}>{content}</a>}
  </div>;
}
