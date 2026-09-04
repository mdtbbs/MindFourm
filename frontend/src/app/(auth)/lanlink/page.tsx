import RoomList from '@/components/lanlink/RoomList';

export default function LanLinkPage() {
  return (
    <>
      <div>
        <h1 className="text-3xl font-bold mb-2">在线房间</h1>
        <p className="text-muted-foreground">
          查看 LanLink 当前公开的 Mindustry 联机房间，无需登录。
        </p>
      </div>
      <RoomList />
    </>
  );
}
