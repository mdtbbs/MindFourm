import type { Metadata } from 'next';
import PostForm from '@/components/forum/post-form';
import { getRequestLocale } from '@/i18n/server';
import { translate } from '@/i18n';

// Posting depends on the current visitor and should never be prerendered or shared-cached.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return { title: translate(locale, 'postForm.title'), robots: { index: false, follow: false } };
}

export default function NewPostPage() {
  return <PostForm />;
}
