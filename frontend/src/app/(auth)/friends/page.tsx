import { Metadata } from 'next';
import FriendRequests from '@/components/lanlink/FriendRequests';
import FriendSearch from '@/components/lanlink/FriendSearch';
import FriendsList from '@/components/forum/friends-list';

export const metadata: Metadata = {
  title: '好友',
  description: '管理你的好友，发送和接受好友请求',
};

export default function FriendsPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">好友</h1>
        <p className="text-muted-foreground mt-1">管理好友列表，发送和接受好友请求</p>
      </div>

      {/* 待处理的好友请求 */}
      <FriendRequests />

      {/* 好友列表 */}
      <FriendsList />

      {/* 搜索添加好友 */}
      <FriendSearch />
    </div>
  );
}
