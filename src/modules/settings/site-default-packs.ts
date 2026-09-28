import type { SiteProfile } from '../../config/site-profile';

export const MINDUSTRY_CLUB_LEGAL = {
  about: `# About Mindustry Club\n\nMindustry Club is an independent community run by players. It is not affiliated with or endorsed by Anuken or the official Mindustry project.\n\nUse the forums to trade ideas, find maps and schematics, share mods, and meet other players. Public resources can be downloaded without an account.\n`,
  terms: `# Terms of Service\n\nMindustry Club is operated by community operators and site administrators. By using the service, you agree to these practical rules.\n\n## Accounts and access\n\nSign-in is provided by MindAuth. Keep your account secure and do not use another person's account without permission. We may restrict access when needed to protect the community or service.\n\n## Your content\n\nYou keep ownership of content you create. You grant Mindustry Club permission to host, display, distribute, and make that content available as needed to operate the service. You may remove your content where the service provides that option, subject to legal, security, and backup needs.\n\n## Community conduct\n\nDo not harass people, impersonate others, spam, interfere with the service, or upload malicious files. Follow the Community Guidelines and Content & Resource Rules.\n\n## Moderation and availability\n\nMembers may report content. Administrators may hide or remove content and restrict accounts to address safety, rights, or abuse reports. The service is provided by a player community and may change or be unavailable.\n`,
  privacy: `# Privacy Policy\n\nMindustry Club uses MindAuth for account identity. The forum stores its own profile, posts, replies, resource records, and moderation decisions in its independent community database.\n\nWe process account details, email verification state, IP address and request metadata, session cookies, and security or moderation logs to provide the service, prevent abuse, and investigate reports. IP and security logs are access-controlled and retained only as needed for those purposes.\n\nEssential cookies keep sessions secure and remember your language choice. We do not use them for cross-site advertising. Public posts and resource pages may be visible to anyone, including search engines.\n\nContact the site administrators through the report or feedback tools for privacy questions or account deletion requests.\n`,
  guidelines: `# Community Guidelines\n\n- Be considerate; critique ideas without targeting people.\n- Keep discussions useful and on topic.\n- Credit creators and link to original sources when possible.\n- Do not post spam, scams, personal information, harassment, or malicious links.\n- Use the report action when content needs administrator attention.\n`,
  resourceRules: `# Content & Resource Rules\n\nUpload only material you have the right to share. Describe versions and compatibility accurately, credit original authors, and include the applicable license.\n\nDo not upload malware, trojans, backdoors, credential theft tools, or files intended to damage devices or accounts. Resource submissions may be checked for abuse and unsafe content.\n`,
  takedown: `# Copyright and Takedown Policy\n\nIf you believe content on Mindustry Club infringes your rights, send the site administrators the page or resource URL, identify the material and the right you hold, and explain what action you request. Include a way to contact you.\n\nAdministrators review reports, may temporarily restrict disputed material, and may remove content or restore access after review. False or abusive reports may be rejected.\n`,
};

const CLUB_SIDEBAR = [
  { id: 'home', label: 'Home', href: '/', icon: 'Home', enabled: true, requiresAuth: false },
  { id: 'categories', label: 'Discussions', href: '/posts', icon: 'MessagesSquare', enabled: true, requiresAuth: false },
  { id: 'tags', label: 'Tags', href: '/tags', icon: 'Tag', enabled: true, requiresAuth: false },
  { id: 'resources', label: 'Resources', href: '/resources', icon: 'Book', enabled: true, requiresAuth: false },
  { id: 'servers', label: 'Game servers', href: '/game-servers', icon: 'Globe2', enabled: true, requiresAuth: false },
];

/** New-database defaults only. SettingsService inserts with INSERT IGNORE, preserving live operator choices. */
export function getSiteDefaultSettings(profile: SiteProfile): Readonly<Record<string, string>> {
  if (profile !== 'mindustry-club') return {};
  return {
    site_name: 'Mindustry Club',
    site_tagline: 'A community built by Mindustry players',
    site_description: 'Discuss Mindustry, discover community-made mods, maps, and schematics.',
    sidebar_title: 'Mindustry Club',
    site_footer: 'An independent community run by Mindustry players.',
    footer_copyright: '© Mindustry Club community operators',
    footer_about_content: MINDUSTRY_CLUB_LEGAL.about,
    footer_thanks_content: '# Thanks\n\nThanks to the players and creators who share their work and help the community grow.',
    footer_terms_content: MINDUSTRY_CLUB_LEGAL.terms,
    footer_privacy_content: MINDUSTRY_CLUB_LEGAL.privacy,
    footer_community_guidelines_content: MINDUSTRY_CLUB_LEGAL.guidelines,
    footer_resource_rules_content: MINDUSTRY_CLUB_LEGAL.resourceRules,
    footer_takedown_content: MINDUSTRY_CLUB_LEGAL.takedown,
    sidebar_navigation_items: JSON.stringify(CLUB_SIDEBAR),
    top_navigation_items: JSON.stringify([
      { type: 'link', label: 'Resources', href: '/resources' },
      { type: 'link', label: 'Discussions', href: '/posts' },
      { type: 'link', label: 'Game servers', href: '/game-servers' },
    ]),
    site_url: process.env.FRONTEND_URL || 'https://mindustry.club',
    latest_posts_title: 'Latest discussions',
    latest_posts_description: 'Talk about the game, share your work, and get help from other players.',
    seo_title_suffix: ' | Mindustry Club',
    seo_default_description: 'An independent Mindustry community for players and creators.',
    search_blocked_keywords: '',
    feature_servers_enabled: 'false',
    feature_servers_directory_enabled: 'true',
    feature_lanlink_enabled: 'false',
    feature_developer_feed_enabled: 'false',
    require_approval: 'false',
    require_post_approval: 'false',
    require_reply_approval: 'false',
    terms_required: 'true',
    terms_summary: 'Please review and accept the Terms of Service and Privacy Policy before participating.',
    smtp_from: 'noreply@mindustry.club',
    welcome_notification_title: 'Welcome to {{site_name}}',
    welcome_notification_body: `Hi **{{username}}**,\n\nWelcome to {{site_name}}. Browse discussions, discover community resources, and share what you build.\n\nPublic resources are available to download without an account.`,
    email_template_reply_subject: '[{{site_name}}] Someone replied to your discussion',
    email_template_reply_body: `Hi {{username}},\n\n**{{actor_name}}** replied to **[{{post_title}}]({{post_url}})**.\n\n> {{reply_excerpt}}\n\n{{#if action_url}}[Open discussion]({{action_url}}){{/if}}`,
    email_template_mention_subject: '[{{site_name}}] You were mentioned',
    email_template_mention_body: `Hi {{username}},\n\n**{{actor_name}}** mentioned you in **[{{post_title}}]({{post_url}})**.\n\n> {{mention_excerpt}}\n\n{{#if action_url}}[Open discussion]({{action_url}}){{/if}}`,
    email_template_message_subject: '[{{site_name}}] A new message from {{sender_name}}',
    email_template_message_body: `Hi {{username}},\n\nYou have a new private message from **{{sender_name}}**.\n\n> {{message_excerpt}}\n\n{{#if action_url}}[Open messages]({{action_url}}){{/if}}`,
    email_template_system_subject: '[{{site_name}}] Community notice',
    email_template_system_body: `Hi {{username}},\n\n{{content}}\n\n{{#if action_url}}[View details]({{action_url}}){{/if}}`,
    email_template_welcome_subject: '[{{site_name}}] Welcome to the community',
    email_template_welcome_body: `{{content}}\n\n{{#if action_url}}[Visit the community]({{action_url}}){{/if}}`,
  };
}
