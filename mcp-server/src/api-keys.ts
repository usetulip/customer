import { createHash, randomBytes } from "node:crypto";

// API keys live in Supabase `public.api_keys` (supabase/migrations). Only a
// SHA-256 hash of each key is stored; the plaintext is shown once at creation.

export const API_KEY_HEADER = "x-tulip-api-key";

// tulip_<env>_<32 random bytes, base64url>
const API_KEY_PATTERN = /^tulip_(live|test)_[A-Za-z0-9_-]{43}$/;

export function generateApiKey(env: "live" | "test" = "live") {
  return `tulip_${env}_${randomBytes(32).toString("base64url")}`;
}

export function hashApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

export function isWellFormedApiKey(key: string) {
  return API_KEY_PATTERN.test(key);
}

export type VerifiedApiKey = {
  keyId: string;
  clientIds: ReadonlySet<string>;
};

/** Resolves a key to its grant, `null` for unknown/revoked/expired keys. Throws if the store is unreachable. */
export type ApiKeyVerifier = (key: string) => Promise<VerifiedApiKey | null>;

type ApiKeyRow = {
  id: string;
  client_ids: string[];
  revoked_at: string | null;
  expires_at: string | null;
};

type CacheEntry = { value: VerifiedApiKey | null; expiresAt: number };

export type SupabaseVerifierOptions = {
  supabaseUrl: string;
  serviceRoleKey: string;
  /** How long a valid key is trusted before re-checking Supabase (revocation latency). */
  cacheTtlMs?: number;
  /** How long an unknown key is remembered, to absorb retries with a bad key. */
  negativeCacheTtlMs?: number;
  maxCacheEntries?: number;
  fetch?: typeof fetch;
};

function serviceRoleHeaders(serviceRoleKey: string): Record<string, string> {
  return {
    apikey: serviceRoleKey,
    // Legacy service_role keys are JWTs; new `sb_secret_` keys go in `apikey` only.
    ...(serviceRoleKey.startsWith("eyJ") ? { Authorization: `Bearer ${serviceRoleKey}` } : {}),
  };
}

export function createSupabaseApiKeyVerifier({
  supabaseUrl,
  serviceRoleKey,
  cacheTtlMs = 60_000,
  negativeCacheTtlMs = 10_000,
  maxCacheEntries = 1_000,
  fetch: fetchImpl = fetch,
}: SupabaseVerifierOptions): ApiKeyVerifier {
  const restUrl = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/api_keys`;
  const headers = serviceRoleHeaders(serviceRoleKey);
  // Map iteration order is insertion order, so the first key is the oldest.
  const cache = new Map<string, CacheEntry>();

  function remember(hash: string, value: VerifiedApiKey | null, expiresAt: number) {
    cache.delete(hash);
    cache.set(hash, { value, expiresAt });
    if (cache.size > maxCacheEntries) {
      cache.delete(cache.keys().next().value!);
    }
  }

  function touch(id: string) {
    // Best effort; a failed timestamp update must not fail the request.
    void fetchImpl(`${restUrl}?id=eq.${id}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ last_used_at: new Date().toISOString() }),
    }).catch(() => {});
  }

  return async (key) => {
    if (!isWellFormedApiKey(key)) {
      return null;
    }

    const hash = hashApiKey(key);
    const now = Date.now();
    const cached = cache.get(hash);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const response = await fetchImpl(
      `${restUrl}?key_hash=eq.${hash}&select=id,client_ids,revoked_at,expires_at&limit=1`,
      { headers },
    );
    if (!response.ok) {
      throw new Error(`API key lookup failed with HTTP ${response.status}`);
    }

    const [row] = (await response.json()) as ApiKeyRow[];
    const expiresAt = row?.expires_at ? Date.parse(row.expires_at) : Infinity;

    if (!row || row.revoked_at || expiresAt <= now) {
      remember(hash, null, now + negativeCacheTtlMs);
      return null;
    }

    const verified: VerifiedApiKey = { keyId: row.id, clientIds: new Set(row.client_ids) };
    remember(hash, verified, Math.min(now + cacheTtlMs, expiresAt));
    touch(row.id);
    return verified;
  };
}
