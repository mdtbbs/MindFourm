import { notFound } from 'next/navigation';
import { siteProfile } from '@/config/site-profile';

export default function LanLinkLayout({ children }: { children: React.ReactNode }) {
  if (!siteProfile.features.lanlink) notFound();
  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">{children}</div>
  );
}
