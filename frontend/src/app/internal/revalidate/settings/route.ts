import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { SETTINGS_CACHE_TAG } from '@/lib/settings/server';

export async function POST(request: Request) {
  const secret = process.env.SETTINGS_REVALIDATE_SECRET;
  if (!secret) {
    return NextResponse.json({ success: false, message: 'Settings revalidation is not configured' }, { status: 503 });
  }

  if (request.headers.get('x-revalidate-secret') !== secret) {
    return NextResponse.json({ success: false, message: 'Invalid revalidation secret' }, { status: 401 });
  }

  revalidateTag(SETTINGS_CACHE_TAG);
  revalidatePath('/');
  revalidatePath('/about');
  revalidatePath('/terms');
  revalidatePath('/privacy');
  revalidatePath('/thanks');
  revalidatePath('/links');
  revalidatePath('/notices');
  revalidatePath('/robots.txt');
  revalidatePath('/sitemap.xml');

  return NextResponse.json({ success: true, revalidated: true, tag: SETTINGS_CACHE_TAG });
}
