import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.API_URL || 'http://localhost:4000';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { code } = body;

    if (!code) {
      return NextResponse.json(
        { success: false, message: 'Missing authorization code', code: 'MISSING_CODE' },
        { status: 400 }
      );
    }

    const res = await fetch(`${BACKEND_URL}/api/auth/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });

    const data = await res.json();

    if (data.success && data.data?.session_token) {
      const cookieStore = await cookies();
      cookieStore.set('forum_session', data.data.session_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60,
      });

      return NextResponse.json({
        success: true,
        user: data.data.user,
      });
    }

    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: 'Network error', code: 'NETWORK_ERROR' },
      { status: 500 }
    );
  }
}