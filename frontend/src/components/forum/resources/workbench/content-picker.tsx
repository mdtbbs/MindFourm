'use client';

import { useEffect, useMemo, useState } from 'react';
import { buildPublicApiUrl } from '@/lib/api/client';
import { unwrapApiPayload } from '@/lib/api/response';

export type GameContent = { type: string; name: string; label: string; english: string; category: string; size: number; icon: string | null; planets?: string[]; config_types?: import('@/lib/api/v1/resources').ResourceV2SchematicConfigDescriptor[] };
let catalogRequest: Promise<GameContent[]> | null = null;
export function loadEditorCatalog(): Promise<GameContent[]> {
  if (!catalogRequest) catalogRequest = fetch(buildPublicApiUrl('/api/resources/editor/catalog'), { credentials: 'include' })
    .then(async response => { if (!response.ok) throw new Error('方块和单位资料暂不可用，请重试'); const result = unwrapApiPayload<{ items: GameContent[] }>(await response.json()); return result?.items || []; })
    .catch(error => { catalogRequest = null; throw error; });
  return catalogRequest;
}
export function useEditorCatalog() {
  const [items, setItems] = useState<GameContent[]>([]);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { let active = true; void loadEditorCatalog().then(value => { if (active) setItems(value); }).catch(caught => { if (active) setError(caught.message); }); return () => { active = false; }; }, [attempt]);
  return { items, error, retry: () => { setError(''); setAttempt(value => value+1); } };
}
const CATEGORIES: Record<string, string> = {
  distribution: '运输', liquid: '液体', power: '电力', crafting: '生产', production: '钻头', turret: '炮塔', defense: '防御', units: '单位', logic: '逻辑', effect: '存储及辅助', core: '核心', floor: '地形', overlay: '矿物及覆盖层', environment: '环境', ground: '陆军', air: '空军', naval: '海军', item: '物品', status: '状态效果', unit: '单位',
};
export default function ContentPicker({ type, value, onChange, disabled = false, filter, label = '选择内容' }: {
  type: string; value: string; onChange: (value: string, item?: GameContent) => void; disabled?: boolean;
  filter?: (item: GameContent) => boolean; label?: string;
}) {
  const { items, error, retry } = useEditorCatalog();
  const [search, setSearch] = useState('');
  const [planet, setPlanet] = useState('');
  const [category, setCategory] = useState('');
  const candidates = items.filter(item => item.type === type && (!filter || filter(item)));
  const categories = [...new Set(candidates.map(item => item.category))];
  const shown = useMemo(() => candidates.filter(item => (!category || item.category === category) && (!planet || item.planets?.includes(planet)) && `${item.name} ${item.label} ${item.english}`.toLowerCase().includes(search.toLowerCase())).slice(0, 80), [candidates, category, planet, search]);
  const selected = items.find(item => item.type === type && item.name === value);
  return <div className="min-w-0 space-y-2">
    <div className="flex min-h-11 items-center gap-2 border border-[var(--border)] px-2">{selected?.icon ? <img src={selected.icon} alt="" width={28} height={28} /> : null}<span className="min-w-0 text-sm">{selected?.label || value || label}</span></div>
    <details className="border border-[var(--border)]"><summary className="min-h-11 cursor-pointer px-3 py-2 text-sm">{label}</summary><div className="space-y-2 border-t border-[var(--border)] p-2">
      <input aria-label={`${label}搜索`} placeholder="中文、英文或名称搜索" value={search} onChange={event => setSearch(event.target.value)} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm" />
      <select aria-label={`${label}分类`} value={category} onChange={event => setCategory(event.target.value)} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-2 text-sm"><option value="">全部分类</option>{categories.map(key => <option key={key} value={key}>{CATEGORIES[key] || '其他'}</option>)}</select>
      {['unit', 'block'].includes(type) ? <select aria-label={`${label}星球`} value={planet} onChange={event => setPlanet(event.target.value)} className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-2 text-sm"><option value="">所有星球</option>{items.filter(item => item.type === 'planet' && candidates.some(candidate => candidate.planets?.includes(item.name))).map(item => <option key={item.name} value={item.name}>{item.label}</option>)}</select> : null}
      <div className="grid max-h-64 grid-cols-2 gap-1 overflow-auto">{shown.map(item => <button key={item.name} type="button" disabled={disabled} aria-pressed={value === item.name} onClick={() => onChange(item.name, item)} className="flex min-h-11 min-w-0 items-center gap-2 border border-[var(--border)] p-2 text-left text-xs disabled:opacity-40">{item.icon ? <img src={item.icon} alt="" width={24} height={24} loading="lazy" /> : null}<span className="min-w-0 break-words" title={`${item.english} (${item.name})`}>{item.label}</span></button>)}</div>
      {error ? <p role="status" className="text-xs text-amber-700">{error}。<button type="button" onClick={retry} className="ml-2 min-h-11 px-2 underline">重新加载</button></p> : null}
    </div></details>
  </div>;
}
