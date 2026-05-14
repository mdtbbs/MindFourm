import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ToastProvider } from '@/lib/toast/context';
import { AuthProvider } from '@/lib/auth/context';
import { SettingsProvider } from '@/lib/settings/context';

const inter = Inter({ subsets: ['latin'] });

const API_BASE = process.env.API_URL || 'http://localhost:4000';

async function fetchSettings(): Promise<Record<string, string>> {
  try {
    const res = await fetch(`${API_BASE}/api/settings`, { next: { revalidate: 60 } });
    if (!res.ok) return {};
    const json = await res.json();
    return json.success ? json.data : {};
  } catch {
    return {};
  }
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
    <html lang="zh-CN">
      <body className={inter.className}>
        <SettingsProvider>
          <AuthProvider>
            <ToastProvider>
              {children}
            </ToastProvider>
          </AuthProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}
