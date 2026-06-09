import { Conversation } from '@/types';
import { cookies } from 'next/headers';
import Link from 'next/link';

export const revalidate = 0;

const API_BASE = process.env.API_URL || 'http://localhost:4000';

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays < 7) return `${diffDays} 天前`;
  return date.toLocaleDateString('zh-CN');
}

async function fetchConversations(): Promise<{ data: Conversation[]; next_cursor: string | null; has_more: boolean }> {
  try {
    const sessionCookie = cookies().get('forum_session');
    const res = await fetch(`${API_BASE}/api/v1/messages`, {
      cache: 'no-store',
      headers: sessionCookie ? { Cookie: `forum_session=${sessionCookie.value}` } : {},
    });
    if (!res.ok) return { data: [], next_cursor: null, has_more: false };
    const json = await res.json();
    return json.success ? json.data : { data: [], next_cursor: null, has_more: false };
  } catch {
    return { data: [], next_cursor: null, has_more: false };
  }
}

export default async function MessagesPage() {
  const conversations = await fetchConversations();

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-surface-900 dark:text-gray-100 mb-6">私信</h1>

      {conversations.data.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-surface-500 dark:text-gray-400">暂无私信</p>
        </div>
      ) : (
        <div className="space-y-2">
          {conversations.data.map((conv) => (
            <Link
              key={conv.user_id}
              href={`/messages/${conv.user_id}`}
              className="block bg-white dark:bg-gray-900 rounded-lg border border-surface-200 dark:border-gray-700 p-4 hover:border-primary-300 dark:hover:border-gray-600 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-surface-200 dark:bg-gray-700 flex items-center justify-center text-lg font-bold text-surface-500 dark:text-gray-400">
                  {conv.avatar_url ? (
                    <img src={conv.avatar_url} alt={conv.username} className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    conv.username?.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-surface-900 dark:text-gray-100">{conv.username}</span>
                    <span className="text-xs text-surface-400 dark:text-gray-500">
                      {formatTime(conv.last_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-sm text-surface-500 dark:text-gray-400 truncate">
                      {conv.last_content?.slice(0, 80) || '暂无内容'}
                    </p>
                    {conv.unread_count > 0 && (
                      <span className="ml-2 px-2 py-0.5 bg-primary-600 text-white text-xs rounded-full">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
