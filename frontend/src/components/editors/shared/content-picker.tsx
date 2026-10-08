'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { EditorContentEntry } from '@/lib/editors/editor-api';
import { ContentIcon, contentLabel } from './content-icon';

export function ContentPicker({
  entries, value, onChange, label = '选择内容', emptyLabel = '没有匹配内容', className = '',
}: {
  entries: EditorContentEntry[];
  value?: string;
  onChange: (entry: EditorContentEntry) => void;
  label?: string;
  emptyLabel?: string;
  className?: string;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const categories = useMemo(() => [...new Set(entries.map((entry) => entry.category_name || entry.category || '').filter(Boolean))].sort(), [entries]);
  const visible = useMemo(() => entries.filter((entry) => {
    const matches = `${contentLabel(entry)} ${entry.internal_name} ${entry.category_name || ''}`.toLocaleLowerCase();
    return (!query.trim() || matches.includes(query.trim().toLocaleLowerCase()))
      && (category === 'all' || (entry.category_name || entry.category) === category);
  }), [category, entries, query]);
  return <section className={`flex min-h-0 flex-col gap-2 ${className}`} aria-label={label}>
    <label className="relative block">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索中文名或英文名" className="min-h-10 w-full border border-[var(--border)] bg-[var(--bg-card)] pl-9 pr-3 text-sm" aria-label={`${label}搜索`} />
    </label>
    {categories.length > 1 ? <select value={category} onChange={(event) => setCategory(event.target.value)} className="min-h-9 border border-[var(--border)] bg-[var(--bg-card)] px-2 text-sm" aria-label="按分类筛选">
      <option value="all">全部分类</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}
    </select> : null}
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" role="listbox" aria-label={label}>
      {visible.map((entry) => <button type="button" key={entry.internal_name} role="option" aria-selected={value === entry.internal_name} onClick={() => onChange(entry)} title={`${contentLabel(entry)} · ${entry.internal_name}`} className={`flex min-h-11 w-full items-center gap-2 border-b border-[var(--border)] px-2 py-1.5 text-left hover:bg-[var(--primary-soft)] ${value === entry.internal_name ? 'bg-[var(--primary-soft)] ring-1 ring-inset ring-[var(--primary)]' : ''}`}>
        <ContentIcon entry={entry} size={30} />
        <span className="min-w-0 flex-1"><span className="block truncate text-sm text-[var(--text)]">{contentLabel(entry)}</span><span className="block truncate text-[11px] text-[var(--text-muted)]">{entry.internal_name}</span></span>
        {entry.size && entry.size > 1 ? <span className="text-xs text-[var(--text-muted)]">{entry.size}×{entry.size}</span> : null}
      </button>)}
      {!visible.length ? <p className="p-4 text-center text-sm text-[var(--text-muted)]">{emptyLabel}</p> : null}
    </div>
  </section>;
}
