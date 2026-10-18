import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { ThemeTokensSchema, type ThemeTokens } from "../../lib/token-schema.ts";
import { serviceRoleHeaders } from "./api-keys.ts";

// Where client tokens and approved blocks come from.
//
// Production reads what operators publish from the admin dashboard
// (usetulip/admin) in tulip-db, with the service role:
//   tulip://tokens/{client_id} ← public.client_token_sets.tokens
//   tulip://blocks/{client_id} ← public.component_blocks where published_at is not null
// Nothing is cached, so a publish is visible on the next request.
//
// Without Supabase credentials (local stdio development), tokens come from
// JSON files named `<client_id>.json` in TULIP_TOKENS_DIR (default
// ../tokens), and no blocks are published.
//
// For local development against Supabase (tulip-http-local), setting
// TULIP_TOKENS_FALLBACK_DIR serves token files for clients that have nothing
// published yet. Never set it on a deployed server.

export const TOKENS_DIR = process.env.TULIP_TOKENS_DIR
  ? resolve(process.env.TULIP_TOKENS_DIR)
  : resolve(dirname(fileURLToPath(import.meta.url)), "../tokens");

// Restricting ids to a slug keeps file lookups inside TOKENS_DIR and keeps
// PostgREST filters free of operators.
export const ClientIdSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,62}$/, "client_id must be a lowercase slug, e.g. acme-corp");

/** The client has no usable tokens (unknown, malformed or failing validation). */
export class TokenLoadError extends Error {}

/** The backing store could not be reached. */
export class StoreUnavailableError extends Error {}

export type PublishedBlock = {
  id: string;
  name: string;
  archetype: string;
  version: number;
  hash: string;
  published_at: string;
  source: string;
};

export interface TulipStore {
  /** Human-readable origin, for startup logs. */
  readonly description: string;
  listClientIds(): Promise<string[]>;
  loadClientTokens(clientId: string): Promise<ThemeTokens>;
  listPublishedBlocks(clientId: string): Promise<PublishedBlock[]>;
}

function parseClientId(clientId: string) {
  const id = ClientIdSchema.safeParse(clientId);
  if (!id.success) {
    throw new TokenLoadError(z.prettifyError(id.error));
  }
  return id.data;
}

function validateTokens(clientId: string, json: unknown, origin: string): ThemeTokens {
  const parsed = ThemeTokensSchema.safeParse(json);
  if (!parsed.success) {
    throw new TokenLoadError(
      `${origin} for "${clientId}" failed validation:\n${z.prettifyError(parsed.error)}`,
    );
  }
  return parsed.data;
}

// --- Files (local development) ---

export function createFileStore(dir = TOKENS_DIR): TulipStore {
  return {
    description: `files in ${dir}`,

    async listClientIds() {
      let entries: string[];
      try {
        entries = await readdir(dir);
      } catch {
        return [];
      }
      return entries
        .filter((entry) => entry.endsWith(".json"))
        .map((entry) => entry.slice(0, -".json".length))
        .filter((id) => ClientIdSchema.safeParse(id).success)
        .sort();
    },

    async loadClientTokens(clientId) {
      const id = parseClientId(clientId);
      let raw: string;
      try {
        raw = await readFile(join(dir, `${id}.json`), "utf8");
      } catch {
        throw new TokenLoadError(`No token definition found for client "${id}"`);
      }

      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch (err) {
        throw new TokenLoadError(
          `Token file for "${id}" is not valid JSON: ${(err as Error).message}`,
        );
      }
      return validateTokens(id, json, "Token file");
    },

    async listPublishedBlocks(clientId) {
      parseClientId(clientId);
      return [];
    },
  };
}

// --- Supabase (published state) ---

type TokenSetRow = { tokens: unknown };

type BlockRow = {
  id: string;
  name: string;
  archetype: string;
  published_version: number;
  published_hash: string;
  published_at: string;
  published_source: string;
};

export type SupabaseStoreOptions = {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetch?: typeof fetch;
};

export function createSupabaseStore({
  supabaseUrl,
  serviceRoleKey,
  fetch: fetchImpl = fetch,
}: SupabaseStoreOptions): TulipStore {
  const restUrl = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1`;
  const headers = serviceRoleHeaders(serviceRoleKey);

  async function select<T>(table: string, query: string): Promise<T[]> {
    let response: Response;
    try {
      response = await fetchImpl(`${restUrl}/${table}?${query}`, { headers });
    } catch (err) {
      throw new StoreUnavailableError(`Supabase is unreachable: ${(err as Error).message}`);
    }
    if (!response.ok) {
      throw new StoreUnavailableError(`Supabase ${table} lookup failed with HTTP ${response.status}`);
    }
    return (await response.json()) as T[];
  }

  return {
    description: `Supabase ${new URL(supabaseUrl).host}`,

    async listClientIds() {
      const rows = await select<{ client_id: string }>(
        "client_token_sets",
        "select=client_id&order=client_id.asc",
      );
      return rows.map((row) => row.client_id).filter((id) => ClientIdSchema.safeParse(id).success);
    },

    async loadClientTokens(clientId) {
      const id = parseClientId(clientId);
      const [row] = await select<TokenSetRow>(
        "client_token_sets",
        `client_id=eq.${id}&select=tokens&limit=1`,
      );
      if (!row) {
        throw new TokenLoadError(`No token definition found for client "${id}"`);
      }
      return validateTokens(id, row.tokens, "Published tokens");
    },

    async listPublishedBlocks(clientId) {
      const id = parseClientId(clientId);
      // published_source is the reviewed snapshot; `source` may hold
      // unreviewed edits and is never selected.
      const rows = await select<BlockRow>(
        "component_blocks",
        `client_id=eq.${id}&published_at=not.is.null` +
          "&select=id,name,archetype,published_version,published_hash,published_at,published_source" +
          "&order=name.asc",
      );
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        archetype: row.archetype,
        version: row.published_version,
        hash: row.published_hash,
        published_at: row.published_at,
        source: row.published_source,
      }));
    },
  };
}

const isNotFound = (err: unknown) =>
  err instanceof TokenLoadError && err.message.startsWith("No token definition found");

/**
 * Published state first; token files only for clients Supabase has no tokens
 * for. Invalid published tokens and Supabase outages are never masked by a
 * file. Blocks always come from the primary store.
 */
export function withFileFallback(primary: TulipStore, fallback: TulipStore): TulipStore {
  return {
    description: `${primary.description}, falling back to ${fallback.description}`,

    async listClientIds() {
      const [published, files] = await Promise.all([primary.listClientIds(), fallback.listClientIds()]);
      return [...new Set([...published, ...files])].sort();
    },

    async loadClientTokens(clientId) {
      try {
        return await primary.loadClientTokens(clientId);
      } catch (err) {
        if (isNotFound(err)) {
          return fallback.loadClientTokens(clientId);
        }
        throw err;
      }
    },

    listPublishedBlocks: (clientId) => primary.listPublishedBlocks(clientId),
  };
}

/** Supabase, optionally backed by TULIP_TOKENS_FALLBACK_DIR for local development. */
export function supabaseStoreFromEnv(
  env: { TULIP_TOKENS_FALLBACK_DIR?: string },
  supabase: { supabaseUrl: string; serviceRoleKey: string },
): TulipStore {
  const store = createSupabaseStore(supabase);
  return env.TULIP_TOKENS_FALLBACK_DIR
    ? withFileFallback(store, createFileStore(resolve(env.TULIP_TOKENS_FALLBACK_DIR)))
    : store;
}

/** Supabase when both credentials are set, otherwise local token files. */
export function storeFromEnv(env: NodeJS.ProcessEnv = process.env): TulipStore {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    return supabaseStoreFromEnv(env, {
      supabaseUrl: env.SUPABASE_URL,
      serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    });
  }
  return createFileStore();
}
