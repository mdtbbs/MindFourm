import { getSiteDefaultSettings } from './site-default-packs';

describe('site default packs', () => {
  it('provides English-only Club seed data without MDTBBS branding or domestic policy text', () => {
    const defaults = getSiteDefaultSettings('mindustry-club');
    expect(defaults.site_name).toBe('Mindustry Club');
    expect(defaults.footer_terms_content).toContain('Terms of Service');
    expect(defaults.footer_privacy_content).toContain('Privacy Policy');
    expect(defaults.footer_community_guidelines_content).toContain('Community Guidelines');
    expect(defaults.footer_resource_rules_content).toContain('Content & Resource Rules');
    expect(defaults.footer_takedown_content).toContain('Copyright and Takedown Policy');
    expect(defaults.footer_terms_content).not.toContain('中华人民共和国');
    expect(defaults.footer_about_content).toContain('not affiliated with or endorsed by Anuken');
    expect(defaults.smtp_from).toBe('noreply@mindustry.club');
    expect(defaults.require_post_approval).toBe('false');
  });

  it('leaves existing MDTBBS seed defaults owned by SettingsService', () => {
    expect(getSiteDefaultSettings('mdtbbs')).toEqual({});
  });
});
