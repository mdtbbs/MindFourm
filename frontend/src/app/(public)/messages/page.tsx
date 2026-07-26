import { cookies } from 'next/headers';
import { fetchApiData } from '@/lib/api/server-fetch';
import { Conversation } from '@/types';
import Link from 'next/link';
import { formatTime } from '@/lib/utils';

export const revalidate = 0;

async function fetchConversations(): Promise<{ data: Conversation[]; next_cursor: string | null; has_more: boolean }> {
  const cookieHeader = (await cookies())
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join('; ');

  return fetchApiData<{ data: Conversation[]; next_cursor: string | null; has_more: boolean }>('/api/messages', {
    init: {
      cache: 'no-store',
      headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
    },
    fallback: { data: [], next_cursor: null, has_more: false },
  });
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
