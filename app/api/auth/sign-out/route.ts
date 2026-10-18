import { NextResponse, type NextRequest } from 'next/server';
import {
  clearSessionCookies,
  hasSupabaseConfig,
  readSessionCookies,
  supabaseAuth,
} from '@/lib/supabase-auth';

export async function POST(request: NextRequest) {
  const { accessToken } = readSessionCookies(request);

  // Revoke the session in Supabase on a best-effort basis; cookies are cleared regardless.
  if (accessToken && hasSupabaseConfig()) {
    try {
      await supabaseAuth('/logout', { method: 'POST', accessToken });
    } catch {}
  }

  const response = NextResponse.json({ success: true });
  clearSessionCookies(response);
  return response;
}
