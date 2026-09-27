import SiteShell from '@/components/layout/site-shell';
import { ChinaCommunityRecommendation } from '@/components/site/china-community-recommendation';

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <><ChinaCommunityRecommendation /><SiteShell>{children}</SiteShell></>;
}
