# Tulip MCP server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes client theme tokens and compiles taste-governed shadcn/Tailwind components. It runs two ways:

- **Local stdio** (`dist/index.js`): spawned by your editor and trusted with every client.
- **Remote Streamable HTTP** (`dist/http.js`): a Hono service for Render. Every request must carry an `x-tulip-api-key` header, which is verified against Supabase, and each key only sees its own clients.

It is a standalone package: the Next app's `tsconfig.json` and ESLint config exclude this directory.

## Setup

```bash
cd mcp-server
npm install
npm run build
```

Then open the repo in Cursor. `.cursor/mcp.json` registers two servers; enable one of them under **Cursor Settings → MCP**:

- `tulip`: local stdio, running `node mcp-server/dist/index.js`. Rebuild after changing anything in `src/` or `../lib/token-schema.ts`.
- `tulip-remote`: the deployed HTTP service. Export `TULIP_API_KEY` in the environment Cursor starts from, and point `url` at your Render service if it isn't `tulip-mcp.onrender.com`.

| Script | What it does |
| --- | --- |
| `npm run build` | Bundles `src/` and `../lib/token-schema.ts` into `dist/index.js` (stdio) and `dist/http.js` (HTTP) with esbuild |
| `npm run dev` / `npm run dev:http` | Runs the stdio / HTTP server from source with `tsx` |
| `npm run start:http` | Runs the built HTTP server (needs the environment below) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run smoke` | Builds, then runs `scripts/smoke.mjs` (stdio) and `scripts/smoke-http.mjs` (HTTP against a mock Supabase) |
| `npm run create-api-key` | Mints an API key and stores its hash in Supabase |

## Resource: `tulip://tokens/{client_id}`

Read-only. Loads `tokens/<client_id>.json` (or `$TULIP_TOKENS_DIR/<client_id>.json`) and validates it against `ThemeTokensSchema` from `lib/token-schema.ts`. Invalid files are reported with the Zod issues and never served. `client_id` must be a lowercase slug, which keeps lookups inside the tokens directory. Listing and `client_id` completion come from the files present. `tokens/demo.json` is a sample.

## Tool: `compile_component`

Input (strict; unknown keys are rejected):

```json
{
  "component_type": "data-table | stats-grid | form-wizard | navigation-sidebar | modal-dialog",
  "client_id": "demo",
  "custom_requirements": {
    "component_name": "AcmeInvoiceTable",
    "title": "Invoices",
    "description": "All invoices this quarter.",
    "density": "comfortable | compact",
    "notes": ["Rendered as JSDoc on the component"]
  }
}
```

`custom_requirements` and all of its fields are optional. The tool returns the code as text and as `structuredContent`: `component_name`, a suggested `file_name` under `components/generated/`, `code`, the shadcn components it imports, and the governance rules it was checked against.

The generated file is a typed client component that imports from `@/components/ui/*`, `@/lib/utils` and `lucide-react`. It sets the client's tokens as CSS variables (`--primary`, `--ring`, `--radius`, `--font-heading`, `--font-body`, plus the token file's component overrides) on its root element.

## Taste governance

The rules live in `src/governance.ts`. Templates build their markup from these constants, and every compile runs `auditTaste` on the emitted code, so output that breaks a rule fails with the list of violations instead of being returned.

- **Icons:** icons in buttons are `size-4`; icons in `size="lg"` buttons and navigation items are `size-5`. All decorative icons are `aria-hidden`.
- **Fonts:** headings use `font-(family-name:--font-heading)`, and the component root uses `font-(family-name:--font-body)`.
- **Focus:** every interactive element (`Button`, `Input`, `a`, `button`, `input`, `textarea`, `select`) carries `focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2`.
- **Colour:** no raw hex values in class names; colour comes from token variables.

## Remote deployment (Streamable HTTP)

`POST /mcp` speaks MCP Streamable HTTP in stateless mode. Each request builds a fresh server scoped to the caller's key, so instances need no sticky sessions and scale horizontally. Responses stream as SSE (`text/event-stream`). `GET` and `DELETE /mcp` return 405, since there are no sessions. `GET /healthz` is public.

### Environment

| Variable | Required | Notes |
| --- | --- | --- |
| `SUPABASE_URL` | yes | `https://pdwtxnngciqdjbylyntk.supabase.co` (tulip-db) |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Used only to look up key hashes. Keep it secret. |
| `PORT` / `HOST` | no | Default `3000` / `0.0.0.0`; Render sets `PORT` |
| `API_KEY_CACHE_TTL_MS` | no | How long a verified key is trusted before Supabase is checked again (default 60000, max 300000) |
| `TULIP_TOKENS_DIR` | no | Defaults to `mcp-server/tokens` |

The server exits at startup if a required variable is missing or invalid.

### Render

`render.yaml` at the repo root is a Render Blueprint for the `tulip-mcp` web service. It builds from the repo root (`cd mcp-server && npm ci && npm run build`), starts `node mcp-server/dist/http.js`, health-checks `/healthz`, and only rebuilds when `mcp-server/**` or `lib/token-schema.ts` changes. Create it under **Render → New → Blueprint**, then set `SUPABASE_SERVICE_ROLE_KEY` in the dashboard.

## API keys

Keys look like `tulip_live_<43 chars>` and are sent in the `x-tulip-api-key` header. They're stored in `public.api_keys` (migration `supabase/migrations/20261018010000_create_api_keys.sql`), which keeps:

- only a SHA-256 hash and a short display prefix, never the key itself
- `client_ids`: the clients the key may use
- `expires_at` and `revoked_at`

RLS is enabled with no policies, so only the service role can read the table.

```bash
SUPABASE_URL=https://pdwtxnngciqdjbylyntk.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
  npm run create-api-key -- --label "Cursor - Alice" --client demo --expires-days 90
```

The key is printed once. To revoke it, set `revoked_at = now()` on its row; it stops working within `API_KEY_CACHE_TTL_MS`.

How requests are checked:

- **Key first:** the middleware runs before an MCP server is created, so no tool or resource is resolved without a valid key.
- **Bad requests are cheap:** malformed keys are rejected without a database lookup, and unknown keys are remembered for 10 seconds.
- **Fails closed:** if Supabase can't be reached, requests get 503 instead of being let through.
- **Scoped to clients:** a key only lists, reads and compiles for its own `client_ids`.
- **Bounded uploads:** request bodies are capped at 1 MiB.
- **Not yet included:** per-key rate limiting. Add it at the edge or in a follow-up.
