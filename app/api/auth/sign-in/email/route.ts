import { NextResponse } from 'next/server';
import {
  hasSupabaseConfig,
  isSupabaseSession,
  missingConfigResponse,
  setSessionCookies,
  supabaseAuth,
  supabaseError,
  toAuthUser,
} from '@/lib/supabase-auth';

export async function POST(request: Request) {
  try {
    if (!hasSupabaseConfig()) {
      return missingConfigResponse();
    }

    const { email, password } = await request.json();

    const { ok, status, data } = await supabaseAuth('/token?grant_type=password', {
      method: 'POST',
      body: { email, password },
    });

    if (!ok || !isSupabaseSession(data)) {
      return NextResponse.json(
        { message: supabaseError(data, 'Failed to sign in') },
        { status: ok ? 500 : status }
      );
    }

    const response = NextResponse.json({
      redirect: false,
      token: null,
      user: toAuthUser(data.user),
    });
    setSessionCookies(response, data);
    return response;
  } catch (err: any) {
    return NextResponse.json({ message: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
