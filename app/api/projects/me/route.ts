import { NextResponse, type NextRequest } from 'next/server';
import {
  hasSupabaseConfig,
  missingConfigResponse,
  requireClientUser,
  setSessionCookies,
} from '@/lib/supabase-auth';
import {
  getProjectByUserId,
  hasProjectStoreConfig,
  serializeProject,
} from '@/lib/projects';

export async function GET(request: NextRequest) {
  try {
    if (!hasSupabaseConfig() || !hasProjectStoreConfig()) {
      return missingConfigResponse();
    }

    const auth = await requireClientUser(request);
    if ('error' in auth) {
      return auth.error;
    }

    const project = await getProjectByUserId(auth.user.id);
    const response = NextResponse.json(
      { project: project ? serializeProject(project) : null },
      { headers: { 'Cache-Control': 'no-store' } }
    );
    if (auth.refreshedSession) {
      setSessionCookies(response, auth.refreshedSession);
    }
    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
