import { translate, type Locale } from '@/i18n';

export type ClubLegalDocumentName = 'terms' | 'privacy' | 'communityGuidelines' | 'resourceRules' | 'copyright';

const SECTIONS: Record<ClubLegalDocumentName, readonly string[]> = {
  terms: ['accounts', 'content', 'conduct', 'moderation'],
  privacy: ['identity', 'data', 'cookies', 'publicContent', 'requests'],
  communityGuidelines: ['respect', 'discussion', 'credit', 'safety', 'reporting'],
  resourceRules: ['rights', 'metadata', 'prohibited', 'review'],
  copyright: ['submit', 'review', 'abuse'],
};

export default function ClubLegalDocument({ document, locale }: { document: ClubLegalDocumentName; locale: Locale }) {
  return <div className="space-y-6">
    {SECTIONS[document].map((section) => <section key={section}>
      <h2 className="mb-1 font-semibold text-[var(--text)]">{translate(locale, `legal.${document}.${section}.title`)}</h2>
      <p>{translate(locale, `legal.${document}.${section}.body`)}</p>
    </section>)}
  </div>;
}
