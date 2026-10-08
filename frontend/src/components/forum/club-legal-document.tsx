'use client';

import { translate, type Locale } from '@/i18n';
import { useSettings } from '@/lib/settings/context';
import { resolveBrand } from '@/lib/theme/brand';

export type ClubLegalDocumentName = 'terms' | 'privacy' | 'communityGuidelines' | 'resourceRules' | 'copyright';

const SECTIONS: Record<ClubLegalDocumentName, readonly string[]> = {
  terms: ['accounts', 'content', 'conduct', 'moderation'],
  privacy: ['identity', 'data', 'cookies', 'publicContent', 'requests'],
  communityGuidelines: ['respect', 'discussion', 'credit', 'safety', 'reporting'],
  resourceRules: ['rights', 'metadata', 'prohibited', 'review'],
  copyright: ['submit', 'review', 'abuse'],
};

export default function ClubLegalDocument({ document, locale }: { document: ClubLegalDocumentName; locale: Locale }) {
  // Legal bodies reference the community by name; resolve it from site settings
  // so one catalog serves every deployment instead of hard-coding a brand.
  const site = resolveBrand(useSettings()).siteName;
  return <div className="space-y-6">
    {SECTIONS[document].map((section) => <section key={section}>
      <h2 className="mb-1 font-semibold text-[var(--text)]">{translate(locale, `legal.${document}.${section}.title`)}</h2>
      <p>{translate(locale, `legal.${document}.${section}.body`, { site })}</p>
    </section>)}
  </div>;
}
