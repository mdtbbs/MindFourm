'use client';

import { Clipboard, ShieldCheck, Star } from 'lucide-react';
import type { Resource } from '@/types';
import { resourceFileSummary } from '@/lib/resources/presentation';

function Stars({ value, interactive = false, onChange }: { value: number; interactive?: boolean; onChange?: (value: number) => void }) {
  return <div className="flex items-center gap-0.5" aria-label={`${value.toFixed(1)} 分`}>
    {[1, 2, 3, 4, 5].map((star) => <button key={star} type="button" disabled={!interactive} onClick={() => onChange?.(star)} className={interactive ? 'cursor-pointer' : 'cursor-default'} aria-label={`${star} 星`}><Star className={`h-4 w-4 ${star <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-[var(--border)]'}`} /></button>)}
  </div>;
}

export default function ResourceAside({
  resource, supportedVersions, compatibility, isAuthenticated, userRating, checksum, onRate, onCopyChecksum,
}: {
  resource: Resource; supportedVersions: string[]; compatibility: string[]; isAuthenticated: boolean;
  userRating: number | null; checksum: string | null; onRate: (value: number) => void; onCopyChecksum: (value: string) => void;
}) {
  const latestVersion = resource.versions?.[0];
  return <aside className="space-y-5 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:self-start lg:overflow-y-auto">
    <section className="rounded-md border border-[var(--border)] bg-[var(--bg-card)] p-5"><h2 className="flex items-center gap-2 font-semibold text-[var(--text)]"><ShieldCheck className="h-4 w-4 text-emerald-600" />支持与兼容性</h2><div className="mt-4 space-y-4 text-sm"><div><h3 className="mb-2 text-[var(--text-muted)]">支持 Mindustry 版本</h3><div className="flex flex-wrap gap-2">{supportedVersions.length ? supportedVersions.map((version) => <span key={version} className="rounded bg-[var(--bg-elevated)] px-2.5 py-1 text-[var(--text-secondary)]">{version}</span>) : <span className="text-[var(--text-muted)]">作者未标注</span>}</div></div><div><h3 className="mb-2 text-[var(--text-muted)]">运行平台</h3><div className="flex flex-wrap gap-2">{compatibility.length ? compatibility.map((platform) => <span key={platform} className="rounded bg-emerald-500/10 px-2.5 py-1 text-emerald-700">{platform}</span>) : <span className="text-[var(--text-muted)]">作者未标注</span>}</div></div></div></section>
    <section className="rounded-md border border-[var(--border)] bg-[var(--bg-card)] p-5"><h2 className="flex items-center gap-2 font-semibold text-[var(--text)]"><Star className="h-4 w-4 text-amber-400" />社区评分</h2>{(resource.rating_count || 0) > 0 ? <div className="mt-4 flex items-center gap-3"><span className="text-3xl font-bold text-[var(--text)]">{(resource.rating_average || 0).toFixed(1)}</span><div><Stars value={resource.rating_average || 0} /><p className="mt-1 text-xs text-[var(--text-muted)]">{resource.rating_count} 人评分</p></div></div> : <div className="mt-4"><Stars value={0} /><p className="mt-2 text-sm font-medium text-[var(--text)]">暂无评分</p><p className="mt-1 text-xs text-[var(--text-muted)]">成为第一个评分的人</p></div>}{isAuthenticated && <div className="mt-4 border-t border-[var(--border)] pt-4"><p className="mb-2 text-sm text-[var(--text-muted)]">给这个资源评分</p><Stars value={userRating || 0} interactive onChange={onRate} /></div>}</section>
    <section className="rounded-md border border-[var(--border)] p-4"><h2 className="flex items-center gap-2 font-semibold text-[var(--text)]"><Clipboard className="h-4 w-4" />文件信息</h2><p className="mt-3 break-words text-sm text-[var(--text-secondary)]">{resourceFileSummary(resource).join(' · ')}</p><p className="mt-1 break-all text-xs text-[var(--text-muted)]">{latestVersion?.file_name || resource.file_name || '外部资源链接'}</p><details className="mt-3 border-t border-[var(--border)] pt-3"><summary className="cursor-pointer text-xs text-[var(--text-muted)]">高级文件信息</summary><dl className="mt-3 space-y-2 text-xs"><div className="flex justify-between gap-3"><dt className="text-[var(--text-muted)]">MIME</dt><dd className="break-all text-right text-[var(--text-secondary)]">{resource.mime_type || latestVersion?.mime_type || '未提供'}</dd></div>{checksum && <div className="space-y-1"><dt className="text-[var(--text-muted)]">SHA-256（点击复制）</dt><dd><button type="button" onClick={() => onCopyChecksum(checksum)} className="block w-full break-all rounded bg-[var(--bg-elevated)] p-2 text-left font-mono text-[11px] text-[var(--text)] hover:text-[var(--primary)]">{checksum}</button></dd></div>}</dl></details></section>
  </aside>;
}
