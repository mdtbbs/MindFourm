import { cookies, headers } from 'next/headers';
import { siteProfile } from '@/config/site-profile';
import { ChinaRecommendationBanner } from './china-community-recommendation-client';
import { shouldRecommendMdtbbs } from './recommendation-policy';

export async function ChinaCommunityRecommendation() {
  if (siteProfile.profile !== 'mindustry-club') return null;
  const [requestHeaders, cookieStore] = await Promise.all([headers(), cookies()]);
  const country = requestHeaders.get('ali-ip-country')?.split(',')[0]?.trim().toUpperCase();
  const explicitLocale = cookieStore.get('forum_locale')?.value;
  if (!shouldRecommendMdtbbs(country, cookieStore.get('club_mdtbbs_recommendation')?.value === 'dismissed', explicitLocale, requestHeaders.get('accept-language'))) return null;
  return <ChinaRecommendationBanner />;
}
