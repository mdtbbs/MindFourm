import { Metadata } from 'next';
import FriendSearch from '@/components/lanlink/FriendSearch';
import FriendsList from '@/components/forum/friends-list';
import { getRequestLocale } from '@/i18n/server';
import { translate } from '@/i18n';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return { title: translate(locale, 'friends.title'), description: translate(locale, 'friends.description') };
}

export default async function FriendsPage() {
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('friends.heading')}</h1>
        <p className="text-muted-foreground mt-1">{t('friends.pageDescription')}</p>
      </div>
      <FriendsList />

      {/* 搜索添加好友 */}
      <FriendSearch />
    </div>
  );
}
