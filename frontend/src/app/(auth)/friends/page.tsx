import { Metadata } from 'next';
import FriendSearch from '@/components/lanlink/FriendSearch';
import FriendsList from '@/components/forum/friends-list';

export const metadata: Metadata = {
  title: '好友',
  description: '管理好友、在线状态与联机邀请',
};

export default function FriendsPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">好友</h1>
        <p className="text-muted-foreground mt-1">查看好友在线状态、活动和联机权限</p>
      </div>
      <FriendsList />

      {/* 搜索添加好友 */}
      <FriendSearch />
    </div>
  );
}
