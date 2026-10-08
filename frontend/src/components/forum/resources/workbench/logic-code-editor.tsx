'use client';

import { useI18n } from '@/i18n/provider';
import { useRef, useState } from 'react';

export default function LogicCodeEditor({ value, onChange, disabled }: {
  value: string; onChange: (value: string) => void; disabled: boolean;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLTextAreaElement>(null);
  const findInput = useRef<HTMLInputElement>(null);
  const [find, setFind] = useState(false);
  const [query, setQuery] = useState('');
  const [feedback, setFeedback] = useState('');
  const search = () => { const start = value.indexOf(query, input.current?.selectionEnd || 0); const index = start >= 0 ? start : value.indexOf(query); if (!query || index < 0) { setFeedback(t('editor.noMatches')); return; } input.current?.focus(); input.current?.setSelectionRange(index, index + query.length); setFeedback(''); };
  const lines = value.split('\n');
  return <div className="min-w-0 space-y-2" onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); event.stopPropagation(); setFind(true); setTimeout(() => findInput.current?.focus(), 0); } }}>
    <button type="button" onClick={() => setFind(!find)} className="min-h-11 border border-[var(--border)] px-3 text-sm">{t('editor.findCode')}</button>
    {find ? <div className="flex gap-2"><input ref={findInput} aria-label={t('editor.findLogicCode')} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') search(); }} className="min-h-11 min-w-0 flex-1 border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm" /><button type="button" onClick={search} className="min-h-11 border border-[var(--border)] px-3 text-sm">{t('editor.nextMatch')}</button></div> : null}
    <div className="flex max-h-80 overflow-auto border border-[var(--border)] bg-[var(--bg-elevated)]">
      <pre aria-hidden="true" className="select-none border-r border-[var(--border)] px-2 py-3 text-right font-mono text-sm leading-6 text-[var(--text-muted)]">{lines.map((_, i) => i + 1).join('\n')}</pre>
      <textarea ref={input} id="schematic-logic-source" aria-label="{t('editor.logicCode')}" maxLength={32_768} spellCheck={false} dir="ltr" disabled={disabled} value={value}  onChange={event => onChange(event.target.value)} onKeyDown={event => {
        if (event.key !== 'Tab') return; event.preventDefault(); const area = event.currentTarget; const start = area.selectionStart; const end = area.selectionEnd; onChange(value.slice(0, start) + '  ' + value.slice(end)); requestAnimationFrame(() => { area.selectionStart = area.selectionEnd = start + 2; });
      }} rows={Math.max(8, Math.min(60, lines.length))} className="min-h-48 min-w-0 flex-1 resize-y bg-transparent p-3 font-mono text-sm leading-6 text-[var(--text)] outline-none" />
    </div>
    <details><summary className="min-h-11 cursor-pointer py-2 text-xs text-[var(--text-muted)]">{t('editor.syntaxPreview')}</summary><pre className="max-h-64 overflow-auto border border-[var(--border)] p-3 font-mono text-sm leading-6">{lines.map((line, i) => <div key={i}><span className="mr-3 text-[var(--text-muted)]">{i + 1}</span>{line.split(/("[^"\n]*"|#[^\n]*|\b\d+(?:\.\d+)?\b|\s+)/).map((part, index) => <span key={index} className={part.startsWith('#') ? 'text-[var(--text-muted)]' : part.startsWith('"') ? 'text-emerald-600' : /^\d/.test(part) ? 'text-amber-600' : index === 0 ? 'text-[var(--primary)]' : ''}>{part}</span>)}</div>)}</pre></details>
    {feedback ? <p role="status" className="text-xs text-[var(--text-muted)]">{feedback}</p> : null}
    {value.includes('\0') || value.length > 32_768 ? <p role="alert" className="text-sm text-red-700">{t('editor.codeInvalid')}</p> : <p className="text-xs text-[var(--text-muted)]">{t('editor.codeNote')}</p>}
  </div>;
}
