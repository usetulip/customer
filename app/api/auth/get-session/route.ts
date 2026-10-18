import { NextResponse, type NextRequest } from 'next/server';
import {
  clearSessionCookies,
  hasSupabaseConfig,
  isSupabaseSession,
  missingConfigResponse,
  readSessionCookies,
  setSessionCookies,
  supabaseAuth,
  toAuthSession,
  toAuthUser,
  type SupabaseUser,
} from '@/lib/supabase-auth';

const noStore = { 'Cache-Control': 'no-store' };

function sessionResponse(accessToken: string, user: SupabaseUser) {
  return NextResponse.json(
    { session: toAuthSession(accessToken, user), user: toAuthUser(user) },
    { headers: noStore }
  );
}

export async function GET(request: NextRequest) {
  try {
    if (!hasSupabaseConfig()) {
      return missingConfigResponse();
    }

    const { accessToken, refreshToken } = readSessionCookies(request);

    if (accessToken) {
      const { ok, data } = await supabaseAuth('/user', { accessToken });
      if (ok) {
        return sessionResponse(accessToken, data as unknown as SupabaseUser);
      }
    }

    // Access token missing or expired: try to rotate it with the refresh token.
    if (refreshToken) {
      const { ok, data } = await supabaseAuth('/token?grant_type=refresh_token', {
        method: 'POST',
        body: { refresh_token: refreshToken },
      });
      if (ok && isSupabaseSession(data)) {
        const response = sessionResponse(data.access_token, data.user);
        setSessionCookies(response, data);
        return response;
      }
    }

    const response = NextResponse.json(null, { headers: noStore });
    if (accessToken || refreshToken) {
      clearSessionCookies(response);
    }
    return response;
  } catch (err: any) {
    return NextResponse.json({ message: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
