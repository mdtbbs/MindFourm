import { getRequestLocale } from '@/i18n/server';
import { translate } from '@/i18n';
import RoomList from '@/components/lanlink/RoomList';

export default async function LanLinkPage() {
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);
  return (
    <>
      <div>
        <h1 className="text-3xl font-bold mb-2">{t('lanlink.roomsTitle')}</h1>
        <p className="text-muted-foreground">
          {t('lanlink.roomsDescription')}
        </p>
      </div>
      <RoomList />
    </>
  );
}
