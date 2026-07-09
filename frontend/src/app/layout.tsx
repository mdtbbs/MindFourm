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
  const title = settings.seo_title_suffix || ' | MindForum';
  const description = settings.seo_default_description || 'A modern community forum';
  const meta: Metadata = {
    title: {
      default: settings.site_name || 'MindForum',
      template: `%s${title}`,
    },
    description,
  };
  if (settings.seo_og_image) {
    meta.openGraph = { images: [settings.seo_og_image] };
  }
  return meta;
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
