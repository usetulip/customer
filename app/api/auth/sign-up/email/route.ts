import { NextResponse } from 'next/server';
import {
  hasSupabaseConfig,
  isSupabaseSession,
  missingConfigResponse,
  setSessionCookies,
  supabaseAuth,
  supabaseError,
  toAuthUser,
  type SupabaseUser,
} from '@/lib/supabase-auth';

export async function POST(request: Request) {
  try {
    if (!hasSupabaseConfig()) {
      return missingConfigResponse();
    }

    const { email, password, name } = await request.json();

    const { ok, status, data } = await supabaseAuth('/signup', {
      method: 'POST',
      body: { email, password, data: { name } },
    });

    if (!ok) {
      return NextResponse.json(
        { message: supabaseError(data, 'Failed to create account') },
        { status }
      );
    }

    // With email confirmation on, Supabase returns only the user and no session.
    if (!isSupabaseSession(data)) {
      return NextResponse.json({
        token: null,
        user: toAuthUser(data as unknown as SupabaseUser),
      });
    }

    const response = NextResponse.json({ token: null, user: toAuthUser(data.user) });
    setSessionCookies(response, data);
    return response;
  } catch (err: any) {
    return NextResponse.json({ message: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
