'use client';
import { useRef, useState, type PointerEvent } from 'react';
import type { WaveGroup } from './wave-model';
import { useI18n } from '@/i18n/provider';

type Drag = { index: number; edge: 'move' | 'begin' | 'end'; begin: number; end: number; x: number; width: number };
export default function WaveTimeline({ groups, disabled, name, onLocate, onUpdate }: {
  groups: WaveGroup[]; disabled: boolean; name: (value: unknown) => string;
  onLocate: (index: number) => void; onUpdate: (index: number, fields: Record<string, unknown>) => void;
}) {
  const { t } = useI18n();
  const [range, setRange] = useState(100);
  const [shown, setShown] = useState(200);
  const drag = useRef<Drag | null>(null);
  const start = (event: PointerEvent<HTMLButtonElement>, index: number, edge: Drag['edge']) => {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const group = groups[index];
    drag.current = { index, edge, begin: Number(group.begin ?? 0), end: edge === 'end' ? Math.min(Number(group.end ?? range-1), range-1) : Number(group.end ?? 2147483647), x: event.clientX, width: event.currentTarget.parentElement!.clientWidth };
  };
  const finish = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current; drag.current = null; if (!current || disabled) return;
    const delta = Math.round((event.clientX-current.x)/Math.max(1,current.width)*range); if (!delta) return;
    if (current.edge === 'begin') onUpdate(current.index, { begin: Math.min(current.end, Math.max(0,current.begin+delta)) });
    else if (current.edge === 'end') onUpdate(current.index, { end: Math.min(2147483647,Math.max(current.begin,current.end+delta)) });
    else if (current.begin+delta >= 0) onUpdate(current.index, { begin: current.begin+delta, end: Math.min(2147483647,current.end+delta) });
  };
  return <section className="min-w-0 space-y-2 border border-[var(--border)] p-3">
    <div className="flex flex-wrap items-center gap-2"><h5 className="text-sm font-semibold">{t('editor.waveTimeline')}</h5><label className="text-xs">{t('editor.showUpToWave')} <input aria-label={t('editor.showUpToWave')} type="number" min={10} max={10000} value={range} onChange={event => setRange(Math.max(10,Math.min(10000,Number(event.target.value)||100)))} className="min-h-11 w-24 border border-[var(--border)] bg-[var(--bg-card)] px-2" /> {t('editor.tabWaves')}</label></div>
    <p className="text-xs text-[var(--text-muted)]">{t('editor.waveTimelineHint')}</p>
    <div className="max-h-64 overflow-auto"><div className="min-w-[480px]">
      {groups.slice(0,shown).map((group,index) => {
        const begin = Math.min(100,Number(group.begin??0)/range*100), end = Math.min(100,(Number(group.end??range-1)+1)/range*100);
        return <div key={index} className="grid min-h-11 grid-cols-[7rem_minmax(0,1fr)] border-b border-[var(--border)]">
          <button type="button" onClick={() => onLocate(index)} className="min-h-11 truncate px-2 text-left text-xs">#{index+1} {name(group.type)}</button>
          <div className="relative min-h-11">
            <button type="button" aria-label={t('editor.moveGroup', { index: index + 1 })} disabled={disabled} onPointerDown={event => start(event,index,'move')} onPointerUp={finish} onPointerCancel={() => { drag.current=null; }} className="absolute top-0 min-h-11 min-w-11 touch-none border border-[var(--primary)] bg-[var(--primary-soft)]" style={{ left: `${Math.min(88,begin)}%`, width: `${Math.max(1,end-begin)}%`, maxWidth: `${100-Math.min(88,begin)}%` }} />
            {(['begin','end'] as const).map(edge => <button key={edge} type="button" aria-label={t('editor.dragGroup', { index: index + 1, edge: edge === 'begin' ? t('editor.edgeStart') : t('editor.edgeEnd') })} disabled={disabled} onPointerDown={event => start(event,index,edge)} onPointerUp={finish} onPointerCancel={() => { drag.current=null; }} className="absolute top-0 z-10 min-h-11 w-11 -translate-x-1/2 touch-none border border-[var(--primary)] bg-[var(--bg-card)] text-xs text-[var(--primary)]" style={{ left: `clamp(22px, ${edge==='begin'?begin:end}%, calc(100% - 22px))` }}>{edge==='begin'?t('editor.edgeStart'):t('editor.edgeEnd')}</button>)}
          </div>
        </div>;
      })}
    </div></div>
    {groups.length>shown ? <button type="button" onClick={() => setShown(value=>value+200)} className="min-h-11 px-3 text-sm text-[var(--primary)]">{t('editor.showMoreGroups')}</button> : null}
  </section>;
}
