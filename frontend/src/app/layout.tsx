import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ToastProvider } from '@/lib/toast/context';
import { AuthProvider } from '@/lib/auth/context';
import { SettingsProvider } from '@/lib/settings/context';
import { ThemeProvider } from '@/lib/shared';
import { LikeProvider } from '@/lib/like/context';
import { PhoneVerificationProvider } from '@/components/phone-verification-provider';
import { fetchPublicSettings } from '@/lib/settings/server';
import { getMetadataBase, getSiteUrl } from '@/lib/seo/site-url';
import JsonLd from '@/components/seo/json-ld';
import { cn } from '@/lib/utils';
import { buildBrandCssVariables, resolveBrand, resolveTitleSuffix } from '@/lib/theme/brand';

const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });
const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export async function generateMetadata(): Promise<Metadata> {
  const settings = await fetchPublicSettings();
  const brand = resolveBrand(settings);
  const titleSuffix = resolveTitleSuffix(settings);
  const siteName = brand.siteName;
  const description = brand.description;

  const meta: Metadata = {
    // Required for relative OG/Twitter images to resolve, and for `alternates.canonical`
    // on child pages to produce absolute URLs.
    metadataBase: getMetadataBase(),
    title: {
      default: siteName,
      // Child pages must pass a BARE title — Next appends this suffix itself. Pages
      // that appended it too rendered "标题 | MindForum | MindForum".
      template: `%s${titleSuffix}`,
    },
    description,
    alternates: {
      canonical: '/',
      // The feed was already being served and was already valid RSS, but nothing
      // advertised it — with no <link rel="alternate">, browsers and feed readers
      // have no way to discover it, so a working feature was effectively invisible.
      types: {
        'application/rss+xml': [{ url: '/api/rss/posts.xml', title: `${siteName} 最新帖子` }],
      },
    },
    openGraph: {
      type: 'website',
      siteName,
      title: siteName,
      description,
      url: '/',
      locale: 'zh_CN',
    },
    twitter: {
      // Upgrades from the small `summary` card Twitter falls back to without this.
      card: settings.seo_og_image ? 'summary_large_image' : 'summary',
      title: siteName,
      description,
    },
  };

  const faviconUrl = brand.faviconUrl || '/favicon.ico';
  meta.icons = {
    icon: faviconUrl,
    shortcut: faviconUrl,
    apple: faviconUrl,
  };

  if (settings.seo_og_image) {
    meta.openGraph = { ...meta.openGraph, images: [settings.seo_og_image] };
    meta.twitter = { ...meta.twitter, images: [settings.seo_og_image] };
  }

  return meta;
}

/**
 * Site-level structured data: identifies the forum and declares its search endpoint
 * so Google can offer a sitelinks search box.
 */
function buildWebSiteJsonLd(settings: Record<string, string>): Record<string, unknown> | null {
  const siteUrl = getSiteUrl();
  if (!siteUrl) return null;

  const siteName = resolveBrand(settings).siteName;

  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteName,
    url: siteUrl,
    description: resolveBrand(settings).description,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${siteUrl}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

function buildBrandStyle(settings: Record<string, string>): CSSProperties {
  return buildBrandCssVariables(settings) as CSSProperties;
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await fetchPublicSettings();
  const webSiteJsonLd = buildWebSiteJsonLd(settings);
  const brandStyle = buildBrandStyle(settings);

  return (
    <html
      lang="zh-CN"
      data-theme="light"
      suppressHydrationWarning
      className={cn(inter.variable, jetbrainsMono.variable)}
      style={brandStyle}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('theme');
                  if (theme === 'dark') {
                    document.documentElement.setAttribute('data-theme', 'dark');
                    document.documentElement.classList.add('dark');
                  } else {
                    // 默认浅色
                    document.documentElement.setAttribute('data-theme', 'light');
                  }
                } catch(e) {}
              })();
            `,
          }}
        />
        {webSiteJsonLd && <JsonLd data={webSiteJsonLd} />}
      </head>
      <body className={inter.className}>
        <ThemeProvider>
          <SettingsProvider initialSettings={settings}>
            <AuthProvider>
              <LikeProvider>
                <ToastProvider>
                  <PhoneVerificationProvider>
                    {children}
                  </PhoneVerificationProvider>
                </ToastProvider>
              </LikeProvider>
            </AuthProvider>
          </SettingsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
