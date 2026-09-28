import { cookies, headers } from 'next/headers';
import { siteProfile } from '@/config/site-profile';
import { ChinaRecommendationBanner } from './china-community-recommendation-client';
import { shouldRecommendMdtbbs, shouldSubdueMdtbbsRecommendation } from './recommendation-policy';

export async function ChinaCommunityRecommendation() {
  if (siteProfile.profile !== 'mindustry-club') return null;
  const [requestHeaders, cookieStore] = await Promise.all([headers(), cookies()]);
  const country = requestHeaders.get('ali-ip-country')?.split(',')[0]?.trim().toUpperCase();
  if (!shouldRecommendMdtbbs(country, cookieStore.get('club_mdtbbs_recommendation')?.value === 'dismissed')) return null;
  const explicitLocale = cookieStore.get('forum_locale')?.value;
  const hasInternationalPreference = shouldSubdueMdtbbsRecommendation(explicitLocale, requestHeaders.get('accept-language'));
  return <ChinaRecommendationBanner subdued={hasInternationalPreference} />;
}
