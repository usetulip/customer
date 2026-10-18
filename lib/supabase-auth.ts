import { NextResponse, type NextRequest } from "next/server";

// Supabase Auth backs the better-auth client endpoints under /api/auth.
// Tokens live in httpOnly cookies and are never returned to the browser.

const ACCESS_COOKIE = "sb-access-token";
const REFRESH_COOKIE = "sb-refresh-token";
const REFRESH_MAX_AGE = 60 * 60 * 24 * 30;

export type SupabaseUser = {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
  created_at: string;
  updated_at?: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
};

export type SupabaseSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: SupabaseUser;
};

type SupabaseResult = {
  ok: boolean;
  status: number;
  data: Record<string, unknown>;
};

export function missingConfigResponse() {
  return NextResponse.json(
    { error: "Missing Supabase environment variables" },
    { status: 500 },
  );
}

export function hasSupabaseConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export async function supabaseAuth(
  path: string,
  options: { method?: string; body?: unknown; accessToken?: string } = {},
): Promise<SupabaseResult> {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1${path}`,
    {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${options.accessToken ?? anonKey}`,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
    },
  );

  const text = await response.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  return { ok: response.ok, status: response.status, data };
}

export function supabaseError(data: Record<string, unknown>, fallback: string) {
  const message =
    data.error_description ?? data.msg ?? data.message ?? data.error;
  return typeof message === "string" ? message : fallback;
}

export function isSupabaseSession(data: unknown): data is SupabaseSession {
  return Boolean(
    data &&
      typeof data === "object" &&
      "access_token" in data &&
      "refresh_token" in data &&
      "user" in data,
  );
}

// Shape the better-auth client expects for `session.user`.
// The role comes from app_metadata, which only the service role can write.
export function toAuthUser(user: SupabaseUser) {
  const metadata = user.user_metadata ?? {};
  const role = user.app_metadata?.role;

  return {
    id: user.id,
    email: user.email ?? "",
    name:
      typeof metadata.name === "string"
        ? metadata.name
        : (user.email?.split("@")[0] ?? "User"),
    image: typeof metadata.avatar_url === "string" ? metadata.avatar_url : null,
    emailVerified: Boolean(user.email_confirmed_at),
    role: typeof role === "string" ? role : "user",
    createdAt: user.created_at,
    updatedAt: user.updated_at ?? user.created_at,
  };
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

// Shape the better-auth client expects for `session.session`.
export function toAuthSession(accessToken: string, user: SupabaseUser) {
  const claims = decodeJwtPayload(accessToken);
  const expiresAt =
    typeof claims.exp === "number"
      ? new Date(claims.exp * 1000).toISOString()
      : null;

  return {
    id: typeof claims.session_id === "string" ? claims.session_id : user.id,
    userId: user.id,
    expiresAt,
    createdAt: user.created_at,
    updatedAt: user.updated_at ?? user.created_at,
  };
}

export function readSessionCookies(request: NextRequest) {
  return {
    accessToken: request.cookies.get(ACCESS_COOKIE)?.value,
    refreshToken: request.cookies.get(REFRESH_COOKIE)?.value,
  };
}

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export function setSessionCookies(
  response: NextResponse,
  session: SupabaseSession,
) {
  response.cookies.set(ACCESS_COOKIE, session.access_token, {
    ...cookieOptions,
    maxAge: session.expires_in,
  });
  response.cookies.set(REFRESH_COOKIE, session.refresh_token, {
    ...cookieOptions,
    maxAge: REFRESH_MAX_AGE,
  });
}

export function clearSessionCookies(response: NextResponse) {
  response.cookies.set(ACCESS_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  response.cookies.set(REFRESH_COOKIE, "", { ...cookieOptions, maxAge: 0 });
}

export type AuthenticatedRequest =
  | { user: SupabaseUser; refreshedSession: SupabaseSession | null }
  | { user: null; refreshedSession: null };

// Resolve the signed-in user from the session cookies, rotating an expired
// access token. Callers must pass `refreshedSession` to `setSessionCookies`.
export async function getRequestUser(
  request: NextRequest,
): Promise<AuthenticatedRequest> {
  const { accessToken, refreshToken } = readSessionCookies(request);

  if (accessToken) {
    const { ok, data } = await supabaseAuth("/user", { accessToken });
    if (ok) {
      return { user: data as unknown as SupabaseUser, refreshedSession: null };
    }
  }

  if (refreshToken) {
    const { ok, data } = await supabaseAuth("/token?grant_type=refresh_token", {
      method: "POST",
      body: { refresh_token: refreshToken },
    });
    if (ok && isSupabaseSession(data)) {
      return { user: data.user, refreshedSession: data };
    }
  }

  return { user: null, refreshedSession: null };
}

// Mirrors the backend's requireClientUser: signed-in, non-admin users only.
export async function requireClientUser(request: NextRequest) {
  const { user, refreshedSession } = await getRequestUser(request);

  if (!user) {
    const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    clearSessionCookies(response);
    return { error: response };
  }

  if (toAuthUser(user).role === "admin") {
    return {
      error: NextResponse.json(
        { error: "Admin accounts cannot access the client portal" },
        { status: 403 },
      ),
    };
  }

  return { user, refreshedSession };
}
