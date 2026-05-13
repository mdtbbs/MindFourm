import Header from '@/components/forum/header';
import Footer from '@/components/forum/footer';
import AnnouncementBanner from '@/components/forum/announcement-banner';

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <AnnouncementBanner />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
