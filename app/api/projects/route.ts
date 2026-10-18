import { NextResponse, type NextRequest } from 'next/server';
import type { IntakeBriefPayload } from '@/lib/api';
import {
  hasSupabaseConfig,
  missingConfigResponse,
  requireClientUser,
  setSessionCookies,
} from '@/lib/supabase-auth';
import {
  createProject,
  hasProjectStoreConfig,
  serializeProject,
} from '@/lib/projects';

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export async function POST(request: NextRequest) {
  try {
    if (!hasSupabaseConfig() || !hasProjectStoreConfig()) {
      return missingConfigResponse();
    }

    const auth = await requireClientUser(request);
    if ('error' in auth) {
      return auth.error;
    }

    let body: Partial<Record<keyof IntakeBriefPayload, unknown>>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { primaryColor, secondaryColor, backgroundColor, layoutType } = body;
    const features = body.features ?? [];

    if (
      typeof primaryColor !== 'string' || !primaryColor ||
      typeof secondaryColor !== 'string' || !secondaryColor ||
      typeof backgroundColor !== 'string' || !backgroundColor ||
      typeof layoutType !== 'string' || !layoutType ||
      !isStringArray(features)
    ) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const result = await createProject(auth.user.id, {
      primaryColor,
      secondaryColor,
      backgroundColor,
      layoutType,
      features,
    });

    const response =
      'error' in result
        ? NextResponse.json(
            { error: result.error, project: serializeProject(result.project) },
            { status: 409 }
          )
        : NextResponse.json({ project: serializeProject(result.project) }, { status: 201 });

    if (auth.refreshedSession) {
      setSessionCookies(response, auth.refreshedSession);
    }
    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
