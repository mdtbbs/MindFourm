import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.API_URL || 'http://localhost:4000';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('forum_session')?.value;

    const res = await fetch(`${BACKEND_URL}/api/auth/check`, {
      headers: {
        Cookie: sessionToken ? `forum_session=${sessionToken}` : '',
      },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return NextResponse.json(
      { authenticated: false },
      { status: 500 }
    );
  }
}