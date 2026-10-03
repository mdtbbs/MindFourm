import { siteProfile, type FrontendSiteProfile } from '@/config/site-profile';
import { buildDiscoverNavigation } from './discover-navigation';

const clubProfile: FrontendSiteProfile = {
  ...siteProfile,
  profile: 'mindustry-club',
  features: { ...siteProfile.features, lanlink: false, resources: true, developers: true },
};
const mdtbbsProfile: FrontendSiteProfile = {
  ...siteProfile,
  profile: 'mdtbbs',
  features: { ...siteProfile.features, lanlink: true, resources: true, developers: false },
};

describe('buildDiscoverNavigation', () => {
  it('keeps legacy LanLink rooms out of the Club discovery page', () => {
    const entries = buildDiscoverNavigation(clubProfile, (key) => key);
    expect(entries.map((entry) => entry.href)).toEqual(['/resources', '/threads', '/developers', '/notices']);
  });

  it('preserves MDTBBS LanLink discovery while the profile enables it', () => {
    const entries = buildDiscoverNavigation(mdtbbsProfile, (key) => key);
    expect(entries.map((entry) => entry.href)).toEqual(['/lanlink', '/resources', '/notices']);
  });
});
