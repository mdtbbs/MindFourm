import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ToastProvider } from '@/lib/toast/context';
import { AuthProvider } from '@/lib/auth/context';
import { SettingsProvider } from '@/lib/settings/context';
import { ThemeProvider } from '@mindproject/shared';
import { LikeProvider } from '@/lib/like/context';
import { PhoneVerificationProvider } from '@/components/phone-verification-provider';
import { fetchApiData } from '@/lib/api/server-fetch';
import { getMetadataBase, getSiteUrl } from '@/lib/seo/site-url';
import JsonLd from '@/components/seo/json-ld';
import { cn } from "@/lib/utils";

const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

async function fetchSettings(): Promise<Record<string, string>> {
  return fetchApiData<Record<string, string>>('/api/settings', {
    init: { next: { revalidate: 60 } },
    fallback: {},
  });
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await fetchSettings();
  const titleSuffix = settings.seo_title_suffix || ' | MindForum';
  const siteName = settings.site_name || 'MindForum';
  const description = settings.seo_default_description || '一个现代化的社区论坛';

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
    alternates: { canonical: '/' },
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
async function buildWebSiteJsonLd(): Promise<Record<string, unknown> | null> {
  const siteUrl = getSiteUrl();
  if (!siteUrl) return null;

  const settings = await fetchSettings();
  const siteName = settings.site_name || 'MindForum';

  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteName,
    url: siteUrl,
    description: settings.seo_default_description || undefined,
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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const webSiteJsonLd = await buildWebSiteJsonLd();

  return (
    <html lang="zh-CN" data-theme="light" suppressHydrationWarning className={cn(inter.variable, jetbrainsMono.variable)}>
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
          <SettingsProvider>
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
