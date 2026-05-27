import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.API_URL || 'http://localhost:4000';

export async function POST() {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('forum_session')?.value;

    if (sessionToken) {
      await fetch(`${BACKEND_URL}/api/auth/logout`, {
        method: 'POST',
        headers: {
          Cookie: `forum_session=${sessionToken}`,
        },
      });
    }

    cookieStore.delete('forum_session');

    return NextResponse.json({ success: true });
  } catch (error) {
    const cookieStore = await cookies();
    cookieStore.delete('forum_session');
    return NextResponse.json({ success: true });
  }
}