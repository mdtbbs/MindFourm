import { Bell, Boxes, MessageSquare, Radio, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FrontendSiteProfile } from '@/config/site-profile';

export type DiscoverNavigationEntry = { href: string; icon: LucideIcon; title: string; description: string };

export function buildDiscoverNavigation(
  profile: FrontendSiteProfile,
  translate: (key: string) => string,
): DiscoverNavigationEntry[] {
  const entries: DiscoverNavigationEntry[] = [];
  if (profile.features.lanlink) {
    entries.push({ href: '/lanlink', icon: Radio, title: translate('discoverPage.rooms'), description: translate('discoverPage.roomsDescription') });
  }
  if (profile.features.resources) {
    entries.push({ href: '/resources', icon: Boxes, title: translate('discoverPage.resources'), description: translate('discoverPage.resourcesDescription') });
  }
  if (profile.profile === 'mindustry-club') {
    entries.push({ href: '/threads', icon: MessageSquare, title: translate('discoverPage.discussions'), description: translate('discoverPage.discussionsDescription') });
    if (profile.features.developers) {
      entries.push({ href: '/developers', icon: Wrench, title: translate('discoverPage.developers'), description: translate('discoverPage.developersDescription') });
    }
  }
  entries.push({ href: '/notices', icon: Bell, title: translate('discoverPage.notices'), description: translate('discoverPage.noticesDescription') });
  return entries;
}
