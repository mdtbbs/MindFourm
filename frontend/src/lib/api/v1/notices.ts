import { fetchV1, requestV1, type FetchV1Options } from './transport';

export type NoticeType = 'system' | 'maintenance' | 'event' | 'policy' | 'release';
export type NoticeStatus = 'draft' | 'scheduled' | 'published' | 'archived';
export type NoticeAuthor = { id: number; username: string; avatar_url: string | null; role: string };
export type NoticeSummary = {
  id: number; public_id: string; slug: string | null; title: string; excerpt: string | null;
  notice_type: NoticeType; is_pinned: boolean; published_at: string | null; edited_at: string | null;
  view_count: number; author: NoticeAuthor | null;
};
export type NoticeDetail = NoticeSummary & {
  status: NoticeStatus; content_markdown: string; content_html: string | null; created_at: string; updated_at: string;
  revisions?: Array<{ id: number; change_summary: string | null; created_at: string; editor: NoticeAuthor | null }>;
  related?: NoticeSummary[];
};
export type NoticeInput = {
  title: string; content_markdown: string; excerpt?: string; notice_type?: NoticeType;
  status?: NoticeStatus; published_at?: string; is_pinned?: boolean; change_summary?: string;
};

export async function listNotices(params: { limit?: number; offset?: number; type?: NoticeType } = {}, options?: FetchV1Options) {
  const search = new URLSearchParams();
  if (params.limit) search.set('limit', String(params.limit));
  if (params.offset) search.set('offset', String(params.offset));
  if (params.type) search.set('type', params.type);
  return fetchV1<{ data: NoticeSummary[]; pagination: { limit: number; offset: number; next_offset: number | null; has_more: boolean } }>(`/notices${search.size ? `?${search}` : ''}`, options);
}
export const getNotice = (id: string, options?: FetchV1Options) => fetchV1<NoticeDetail>(`/notices/${encodeURIComponent(id)}`, options);
export const listAdminNotices = () => fetchV1<NoticeDetail[]>('/admin/notices');
export const createNotice = (input: NoticeInput) => requestV1<NoticeDetail>('/admin/notices', { method: 'POST', body: JSON.stringify(input) });
export const updateNotice = (id: string, input: Partial<NoticeInput>) => requestV1<NoticeDetail>(`/admin/notices/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) });
export const deleteNotice = (id: string) => requestV1<{ message: string }>(`/admin/notices/${encodeURIComponent(id)}`, { method: 'DELETE' });
