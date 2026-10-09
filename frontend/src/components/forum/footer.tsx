'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { useSettings } from '@/lib/settings/context';
import {
  getFooterSettings,
  isExternalHref,
  type FooterFriendlyLink,
} from '@/lib/footer/footer-settings';
import { useNavigation } from '@/lib/navigation/context';
import { useI18n } from '@/i18n/provider';
import { siteProfile } from '@/config/site-profile';
import { LocaleSwitcher } from '@/i18n/provider';

const FOOTER_LINKS = [
  { href: '/links', key: 'footer.links' },
  { href: '/thanks', key: 'footer.thanks' },
  { href: '/about', key: 'footer.about' },
  { href: '/terms', key: 'footer.terms' },
  { href: '/privacy', key: 'footer.privacy' },
  { href: '/feedback', key: 'footer.feedback' },
];

const CLUB_POLICY_LINKS = [
  { href: '/community-guidelines', key: 'footer.communityGuidelines' },
  { href: '/resource-rules', key: 'footer.resourceRules' },
  { href: '/copyright', key: 'footer.takedown' },
];

function FooterAnchor({ href, children, className = '' }: { href: string; children: React.ReactNode; className?: string }) {
  const external = isExternalHref(href);
  const commonClass = `transition-colors hover:text-[var(--primary-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] ${className}`;

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={commonClass}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={commonClass}>
      {children}
    </Link>
  );
}

function FriendlyLinkCard({ link }: { link: FooterFriendlyLink }) {
  const external = isExternalHref(link.href);

  return (
    <FooterAnchor
      href={link.href}
      className="group rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-left hover:border-[var(--primary)]"
    >
      <span className="flex items-center justify-between gap-2 text-xs font-medium text-[var(--text)] group-hover:text-[var(--primary-text)]">
        <span className="truncate">{link.label}</span>
        {external && <ExternalLink className="h-3 w-3 shrink-0 text-[var(--text-muted)] group-hover:text-[var(--primary-text)]" aria-hidden="true" />}
      </span>
      {link.description && (
        <span className="mt-0.5 block truncate text-[11px] leading-4 text-[var(--text-muted)]">
          {link.description}
        </span>
      )}
    </FooterAnchor>
  );
}

function FilingText({ number, href }: { number: string; href: string }) {
  if (!number) return null;
  if (href) {
    return <FooterAnchor href={href}>{number}</FooterAnchor>;
  }
  return <span>{number}</span>;
}

export default function Footer() {
  const pathname = usePathname();
  const settings = useSettings();
  const navigation = useNavigation();
  const { t } = useI18n();
  const footer = getFooterSettings(settings);
  const showFriendlyLinks = pathname === '/';
  const featuredLinks = showFriendlyLinks ? navigation.links.slice(0, 3) : [];

  return (
    <footer className="mt-auto border-t border-[var(--border)] bg-[var(--bg-card)]">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {featuredLinks.length > 0 && (
          <section className="mb-5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3" aria-labelledby="footer-friendly-links">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 id="footer-friendly-links" className="text-xs font-semibold text-[var(--text)]">{t('footer.friendly')}</h2>
              <Link href="/links" className="text-xs font-medium text-[var(--primary-text)] hover:underline">
                {t('footer.more')} →
              </Link>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {featuredLinks.map((link) => (
                <FriendlyLinkCard key={`${link.label}-${link.href}`} link={link} />
              ))}
            </div>
          </section>
        )}

        <nav aria-label={t('footer.navigation')} className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm text-[var(--text-secondary)]">
          {[...FOOTER_LINKS, ...(siteProfile.profile === 'mindustry-club' ? CLUB_POLICY_LINKS : [])].map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-[var(--primary-text)] hover:underline">
              {t(link.key)}
            </Link>
          ))}
        </nav>
        <div className="mt-3 flex justify-center"><LocaleSwitcher /></div>

        <div className="mt-4 space-y-2 text-center text-sm text-[var(--text-muted)]">
          <p>{footer.copyright}</p>
          {siteProfile.features.domesticFiling && (footer.icpNumber || footer.policeNumber) && (
            <p className="flex flex-wrap justify-center gap-x-4 gap-y-1">
              <FilingText number={footer.icpNumber} href={footer.icpUrl} />
              <FilingText number={footer.policeNumber} href={footer.policeUrl} />
            </p>
          )}
        </div>
      </div>
    </footer>
  );
}
