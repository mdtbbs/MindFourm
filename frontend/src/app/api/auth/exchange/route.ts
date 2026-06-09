import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.API_URL || 'http://localhost:4000';

function parseState(state: string | undefined): { nonce: string; returnTo: string } | null {
  if (!state) return null;
  const [nonce, encodedReturnTo = '%2F'] = state.split('.', 2);
  if (!/^[a-f0-9]{32}$/.test(nonce)) return null;
  const returnTo = decodeURIComponent(encodedReturnTo);
  if (!returnTo.startsWith('/') || returnTo.startsWith('//') || returnTo.includes('://')) return null;
  return { nonce, returnTo };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { code, state } = body;

    if (!code) {
      return NextResponse.json(
        { success: false, message: 'Missing authorization code', code: 'MISSING_CODE' },
        { status: 400 }
      );
    }

    const parsedState = parseState(state);
    const cookieStore = cookies();
    const expectedNonce = cookieStore.get('oauth_state_nonce')?.value;
    if (!parsedState || !expectedNonce || parsedState.nonce !== expectedNonce) {
      return NextResponse.json(
        { success: false, message: 'OAuth state 无效', code: 'INVALID_STATE' },
        { status: 400 }
      );
    }

    const res = await fetch(`${BACKEND_URL}/api/auth/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, state }),
    });

    const data = await res.json();

    if (data.success && data.data?.session_token) {
      cookieStore.set('forum_session', data.data.session_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60,
      });
      cookieStore.set('oauth_state_nonce', '', { path: '/', maxAge: 0 });

      return NextResponse.json({
        success: true,
        user: data.data.user,
        returnTo: parsedState.returnTo,
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
