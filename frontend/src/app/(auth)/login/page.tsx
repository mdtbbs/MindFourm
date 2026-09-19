import { redirect } from 'next/navigation';
import { safeReturnPath } from '@/lib/auth/return-url';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ redirect?: string; returnUrl?: string }> }) {
  const params = await searchParams;
  const authBase = process.env.NEXT_PUBLIC_MINDAUTH_URL || 'http://localhost:4001';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const query = new URLSearchParams({ redirect: `${siteUrl}/api/auth/callback`, client_id: process.env.NEXT_PUBLIC_MINDAUTH_CLIENT_ID || 'forum', response_type: 'code', state: safeReturnPath(params.redirect || params.returnUrl) });
  redirect(`${authBase}/authorize?${query.toString()}`);
}
