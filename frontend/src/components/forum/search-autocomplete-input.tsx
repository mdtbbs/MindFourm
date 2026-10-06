'use client';

import { useEffect, useState } from 'react';
import { fetchV1 } from '@/lib/api/v1/transport';

type SearchAutocompleteInputProps = {
  initialValue: string;
  label: string;
  placeholder: string;
  suggestionsLabel: string;
};

export default function SearchAutocompleteInput({ initialValue, label, placeholder, suggestionsLabel }: SearchAutocompleteInputProps) {
  const [query, setQuery] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => { setQuery(initialValue); }, [initialValue]);

  useEffect(() => {
    const normalized = query.trim();
    if (Array.from(normalized).length < 2) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: normalized });
      fetchV1<string[]>(`/search/suggestions?${params.toString()}`, { signal: controller.signal })
        .then((items) => setSuggestions(Array.isArray(items) ? items.slice(0, 8) : []))
        .catch(() => { if (!controller.signal.aborted) setSuggestions([]); });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <div className="min-w-52 flex-1 sm:flex-none">
      <label htmlFor="search-query" className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">{label}</label>
      <input
        id="search-query"
        name="q"
        type="search"
        list="search-query-suggestions"
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        placeholder={placeholder}
        autoComplete="off"
        maxLength={255}
        className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text)]"
      />
      <datalist id="search-query-suggestions" aria-label={suggestionsLabel}>
        {suggestions.map((suggestion) => <option key={suggestion} value={suggestion} />)}
      </datalist>
    </div>
  );
}
