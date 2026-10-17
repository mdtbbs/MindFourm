'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Check,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Package,
  RefreshCw,
  UserRound,
  X,
} from 'lucide-react';
import { adminApi, resourceAdminApi, userApi } from '@/lib/api/client';
import type { ModerationItem, Resource, UserProfile } from '@/types';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';
import InlineLoading from '@/components/ui/inline-loading';
import ResourceModerationReview from '@/components/admin/resource-moderation-review';

type Filter = 'all' | 'posts' | 'replies' | 'avatars' | 'resources';

type QueueItem =
  | { kind: 'community'; key: string; data: ModerationItem }
  | { kind: 'resource'; key: string; data: Resource };

const filters: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: '帖子、回复与头像' },
  { value: 'posts', label: '帖子' },
  { value: 'replies', label: '回复' },
  { value: 'avatars', label: '头像' },
  { value: 'resources', label: '资源' },
];

function isFilter(value: string | null): value is Filter {
  return value === 'all' || value === 'posts' || value === 'replies' || value === 'avatars' || value === 'resources';
}

function queueTitle(item: QueueItem): string {
  if (item.kind === 'resource') return item.data.title;
  return item.data.title || `${item.data.item_type} #${item.data.id}`;
}

function queueSummary(item: QueueItem): string {
  if (item.kind === 'resource') {
    return item.data.description || item.data.content_text || item.data.content || '暂无描述';
  }
  return item.data.content || '暂无正文';
}

export default function ModerationPage() {
  const searchParams = useSearchParams();
  const queryFilter = searchParams?.get('type');
  const [filter, setFilter] = useState<Filter>(isFilter(queryFilter) ? queryFilter : 'all');
  const [items, setItems] = useState<QueueItem[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [author, setAuthor] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    if (isFilter(queryFilter)) setFilter(queryFilter);
  }, [queryFilter]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let next: QueueItem[];
      if (filter === 'resources') {
        const result = await resourceAdminApi.list({ limit: 50, status: 'pending' });
        next = result.data.map((resource) => ({
          kind: 'resource' as const,
          key: `resource:${resource.id}`,
          data: resource,
        }));
      } else {
        const result = await adminApi.getModeration({ type: filter, page: 1, limit: 50 });
        next = result.data.map((entry) => ({
          kind: 'community' as const,
          key: `${entry.item_type}:${entry.id}`,
          data: entry,
        }));
      }

      setItems(next);
      setSelectedKey((current) => current && next.some((item) => item.key === current) ? current : next[0]?.key ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载审核队列失败');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  const selected = useMemo(
    () => items.find((item) => item.key === selectedKey) ?? null,
    [items, selectedKey],
  );

  useEffect(() => {
    let cancelled = false;
    setAuthor(null);

    const loadAuthor = async () => {
      if (!selected) return;

      try {
        if (selected.kind === 'resource') {
          const profile = await userApi.getById(selected.data.user_id);
          if (!cancelled) setAuthor(profile);
          return;
        }

        if (!selected.data.author_username) return;
        const matches = await userApi.search(selected.data.author_username, 5);
        const exact = matches.find((candidate) => candidate.username === selected.data.author_username) ?? matches[0];
        if (!exact) return;
        const profile = await userApi.getById(exact.id);
        if (!cancelled) setAuthor(profile);
      } catch {
        if (!cancelled) setAuthor(null);
      }
    };

    void loadAuthor();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const flash = (value: string) => {
    setMessage(value);
    window.setTimeout(() => setMessage(null), 2500);
  };

  const approve = async () => {
    if (!selected || actionLoading) return;
    setActionLoading(true);
    setError(null);

    try {
      if (selected.kind === 'resource') {
        await resourceAdminApi.updateStatus(selected.data.id, 'approved');
      } else {
        await adminApi.approvePost(selected.data.id, selected.data.item_type);
      }
      flash('审核已通过');
      await fetchItems();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '审核通过失败');
    } finally {
      setActionLoading(false);
    }
  };

  const reject = async () => {
    if (!selected || actionLoading) return;
    setActionLoading(true);
    setError(null);

    try {
      if (selected.kind === 'resource') {
        await resourceAdminApi.updateStatus(selected.data.id, 'rejected', rejectReason || undefined);
      } else {
        await adminApi.rejectPost(selected.data.id, selected.data.item_type, rejectReason || undefined);
      }
      setRejectOpen(false);
      setRejectReason('');
      flash('已拒绝并移出当前队列');
      await fetchItems();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '拒绝失败');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-surface-900">审核工作台</h1>
          <p className="mt-1 text-sm text-surface-500">队列、内容预览和作者上下文放在同一屏，减少来回跳页。</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as Filter)}
            className="border border-surface-200 bg-white px-3 py-2 text-sm"
            aria-label="审核类型"
          >
            {filters.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void fetchItems()}
            disabled={loading}
            className="inline-flex items-center gap-2 border border-surface-200 bg-white px-3 py-2 text-sm text-surface-700 hover:bg-surface-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </div>

      {message ? <Alert type="success" message={message} /> : null}
      {error ? <Alert type="error" message={error} /> : null}

      <div className="grid min-h-[620px] border border-surface-200 bg-white 2xl:grid-cols-[280px_minmax(0,1fr)_320px]">
        <section className="border-b border-surface-200 2xl:border-b-0 2xl:border-r">
          <div className="flex h-11 items-center justify-between border-b border-surface-200 px-3">
            <span className="text-xs font-semibold text-surface-800">待审核队列</span>
            <span className="font-mono text-[10px] text-surface-400">{items.length}</span>
          </div>
          <div className="max-h-[280px] overflow-y-auto 2xl:max-h-[calc(100vh-210px)]">
            {loading && items.length === 0 ? (
              <InlineLoading label="正在加载审核队列" className="min-h-28" />
            ) : items.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-surface-400">当前队列已清空。</div>
            ) : (
              items.map((item) => {
                const active = item.key === selectedKey;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSelectedKey(item.key)}
                    className={`block w-full border-b border-surface-100 px-3 py-3 text-left ${active ? 'border-l-2 border-l-primary-500 bg-primary-50/40' : 'border-l-2 border-l-transparent hover:bg-surface-50'}`}
                  >
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-surface-400">
                      {item.kind === 'resource' ? <Package className="h-3 w-3" /> : item.data.item_type === 'avatar' ? <ImageIcon className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                      <span>{item.kind === 'resource' ? 'resource' : item.data.item_type}</span>
                    </div>
                    <div className="mt-1 truncate text-sm font-medium text-surface-900">{queueTitle(item)}</div>
                    <div className="mt-1 line-clamp-2 text-xs leading-5 text-surface-500">{queueSummary(item)}</div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="min-w-0 border-b border-surface-200 2xl:border-b-0 2xl:border-r">
          <div className="flex h-11 items-center justify-between border-b border-surface-200 px-4">
            <span className="text-xs font-semibold text-surface-800">内容预览</span>
            {selected ? (
              <span className="font-mono text-[10px] text-surface-400">{selected.key}</span>
            ) : null}
          </div>

          {!selected ? (
            <div className="flex min-h-96 items-center justify-center text-sm text-surface-400">从左侧选择一条待审核内容。</div>
          ) : selected.kind === 'resource' ? (
            <div className="space-y-5 p-5">
              {selected.data.preview_url ? (
                <div className="border border-surface-200 bg-surface-50 p-3">
                  <img
                    src={selected.data.preview_url}
                    alt={selected.data.title}
                    className="mx-auto max-h-72 max-w-full object-contain"
                  />
                </div>
              ) : null}
              <div>
                <h2 className="text-xl font-semibold text-surface-900">{selected.data.title}</h2>
                <div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-surface-700">
                  {selected.data.description || selected.data.content_text || selected.data.content || '暂无描述'}
                </div>
              </div>
              <div className="grid border border-surface-200 sm:grid-cols-2">
                {[
                  ['资源类型', selected.data.resource_kind || selected.data.resource_type],
                  ['版本', selected.data.version || '—'],
                  ['分类', selected.data.category_name || '—'],
                  ['解析状态', selected.data.resource_kind === 'mod' ? '见下方 Mod 静态解析结果' : selected.data.renderer_status || '—'],
                ].map(([label, value], index) => (
                  <div key={label} className={`px-4 py-3 ${index % 2 ? 'sm:border-l' : ''} ${index > 1 ? 'border-t' : ''} border-surface-200`}>
                    <div className="text-[10px] uppercase tracking-wide text-surface-400">{label}</div>
                    <div className="mt-1 text-sm text-surface-800">{value}</div>
                  </div>
                ))}
              </div>
              {(selected.data.metadata?.supported_versions?.length ?? 0) > 0 ? (
                <div>
                  <div className="text-xs font-semibold text-surface-700">支持版本</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {selected.data.metadata?.supported_versions.map((version) => (
                      <span key={version} className="border border-surface-200 px-2 py-1 font-mono text-[10px] text-surface-600">{version}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              <ResourceModerationReview resource={selected.data} />
              <Link
                href={`/resources/${selected.data.id}`}
                target="_blank"
                className="inline-flex items-center gap-2 text-xs font-medium text-primary-600 hover:underline"
              >
                在前台打开 <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            <div className="space-y-5 p-5">
              {selected.data.item_type === 'avatar' && selected.data.avatar_url ? (
                <div className="border border-surface-200 bg-surface-50 p-6">
                  <img src={selected.data.avatar_url} alt="待审核头像" className="mx-auto h-40 w-40 rounded-full object-cover" />
                </div>
              ) : null}
              {selected.data.title ? <h2 className="text-xl font-semibold text-surface-900">{selected.data.title}</h2> : null}
              <div className="whitespace-pre-wrap text-sm leading-7 text-surface-700">{selected.data.content}</div>
              {selected.data.item_type !== 'avatar' ? (
                <Link
                  href={`/posts/${selected.data.item_type === 'post' ? selected.data.id : selected.data.post_id ?? ''}`}
                  target="_blank"
                  className="inline-flex items-center gap-2 text-xs font-medium text-primary-600 hover:underline"
                >
                  在前台打开 <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              ) : null}
            </div>
          )}

          {selected ? (
            <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-surface-200 bg-white/95 px-4 py-3 backdrop-blur">
              <Button variant="destructive" onClick={() => setRejectOpen(true)} disabled={actionLoading}>
                <X className="mr-1 h-4 w-4" />
                拒绝
              </Button>
              <Button onClick={() => void approve()} disabled={actionLoading}>
                <Check className="mr-1 h-4 w-4" />
                {actionLoading ? '处理中' : '通过'}
              </Button>
            </div>
          ) : null}
        </section>

        <aside>
          <div className="flex h-11 items-center border-b border-surface-200 px-4">
            <span className="text-xs font-semibold text-surface-800">上下文</span>
          </div>
          {selected ? (
            <div className="divide-y divide-surface-100">
              <div className="p-4">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-surface-700">
                  <UserRound className="h-4 w-4" /> 作者
                </div>
                <div className="text-sm font-medium text-surface-900">
                  {author?.username || (selected.kind === 'resource' ? selected.data.username : selected.data.author_username) || '未知用户'}
                </div>
                {author ? (
                  <dl className="mt-3 space-y-2 text-xs">
                    <div className="flex justify-between"><dt className="text-surface-400">角色</dt><dd>{author.role}</dd></div>
                    <div className="flex justify-between"><dt className="text-surface-400">主题</dt><dd>{author.post_count}</dd></div>
                    <div className="flex justify-between"><dt className="text-surface-400">回复</dt><dd>{author.reply_count}</dd></div>
                    <div className="flex justify-between"><dt className="text-surface-400">等级</dt><dd>{author.level?.name || '—'}</dd></div>
                    {author.id ? (
                      <div className="pt-2">
                        <Link href={`/admin/users?open=${author.id}`} className="text-primary-600 hover:underline">打开用户详情 →</Link>
                      </div>
                    ) : null}
                  </dl>
                ) : (
                  <div className="mt-2 text-xs text-surface-400">未获取到更多用户资料。</div>
                )}
              </div>

              <div className="p-4">
                <div className="text-xs font-semibold text-surface-700">提交信息</div>
                <dl className="mt-3 space-y-2 text-xs">
                  <div className="flex justify-between"><dt className="text-surface-400">时间</dt><dd className="text-right">{new Date(selected.data.created_at).toLocaleString('zh-CN')}</dd></div>
                  <div className="flex justify-between"><dt className="text-surface-400">类型</dt><dd>{selected.kind === 'resource' ? selected.data.resource_kind || selected.data.resource_type : selected.data.item_type}</dd></div>
                  {selected.kind === 'resource' ? (
                    <>
                      <div className="flex justify-between"><dt className="text-surface-400">{selected.data.resource_kind === 'mod' ? 'Mod 解析' : '解析'}</dt><dd>{selected.data.resource_kind === 'mod' ? '见审核详情' : selected.data.renderer_status || '未提供'}</dd></div>
                      <div className="flex justify-between"><dt className="text-surface-400">完整性</dt><dd>{selected.data.integrity || '—'}</dd></div>
                    </>
                  ) : null}
                </dl>
              </div>
            </div>
          ) : null}
        </aside>
      </div>

      {rejectOpen && selected ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setRejectOpen(false)}>
          <div className="w-full max-w-lg border border-surface-200 bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="border-b border-surface-200 px-5 py-4">
              <h3 className="text-sm font-semibold text-surface-900">拒绝「{queueTitle(selected)}」</h3>
              <p className="mt-1 text-xs text-surface-500">原因会用于后续沟通和审核追溯，建议写清具体问题。</p>
            </div>
            <div className="p-5">
              <textarea
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                rows={5}
                className="w-full border border-surface-200 px-3 py-2 text-sm outline-none focus:border-primary-500"
                placeholder="例如：描述不完整、资源无法解析、内容不符合社区规则……"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-surface-200 px-5 py-4">
              <Button variant="ghost" onClick={() => setRejectOpen(false)}>取消</Button>
              <Button variant="destructive" onClick={() => void reject()} disabled={actionLoading}>
                {actionLoading ? '处理中' : '确认拒绝'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
