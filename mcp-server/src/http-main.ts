import { serve } from "@hono/node-server";
import { z } from "zod";
import { createSupabaseApiKeyVerifier } from "./api-keys.ts";
import { createHttpApp } from "./http.ts";
import { createSupabaseStore } from "./tokens.ts";

// Remote entry point (Render). Fails fast if required configuration is missing.
// Tokens and approved blocks always come from Supabase here; local token
// files are for stdio development only.

const EnvSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default("0.0.0.0"),
  API_KEY_CACHE_TTL_MS: z.coerce.number().int().min(0).max(300_000).default(60_000),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error(`[tulip-mcp] invalid configuration:\n${z.prettifyError(parsed.error)}`);
  process.exit(1);
}
const env = parsed.data;

const store = createSupabaseStore({
  supabaseUrl: env.SUPABASE_URL,
  serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
});

const app = createHttpApp({
  store,
  verifyApiKey: createSupabaseApiKeyVerifier({
    supabaseUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    cacheTtlMs: env.API_KEY_CACHE_TTL_MS,
  }),
});

const server = serve({ fetch: app.fetch, port: env.PORT, hostname: env.HOST }, (info) => {
  console.error(
    `[tulip-mcp] listening on http://${info.address}:${info.port}/mcp (tokens: ${store.description})`,
  );
});

function shutdown() {
  server.close(() => process.exit(0));
  // Don't wait forever on open SSE streams.
  setTimeout(() => process.exit(0), 10_000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
