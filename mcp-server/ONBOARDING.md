# Design partner onboarding: local Cursor integration

This guide gets the Tulip MCP server running inside Cursor on your machine. You can then query a client's theme tokens and compile governed components. It takes about five minutes.

`.cursor/mcp.json` in this repo defines two servers. Enable **one** at a time under **Cursor Settings → MCP**:

| Server | Transport | Key needed | Use it for |
| --- | --- | --- | --- |
| `tulip` | stdio: Cursor runs `node mcp-server/dist/index.js` | No | Day-to-day use and design partner testing |
| `tulip-http-local` | Streamable HTTP at `http://localhost:3333/mcp` | `TULIP_API_KEY` | Testing the API-key layer before the hosted service exists |

The local HTTP server checks keys against tulip-db, so running it needs the Supabase service role key. Only the Tulip team should run it. Design partners use `tulip`.

## Prerequisites

- **Node.js 22 LTS.** Node 20.6 is the minimum, because the scripts use `--env-file`. Check with `node -v`.
- **Cursor**, with this repository open as the workspace folder. The manifest resolves paths from `${workspaceFolder}`.

## 1. Build the server

```bash
cd mcp-server
npm install
npm run build
```

Rebuild after pulling changes to `mcp-server/src/` or `lib/token-schema.ts`.

## 2. Option A: stdio (no key)

1. In **Cursor Settings → MCP**, enable `tulip`. A green dot means Cursor started it.
2. Check the same configuration from a terminal:

   ```bash
   npm run verify -- --server tulip
   ```

   Expected output:

   ```
   tulip (stdio node)
     ✓ clients visible: demo
     ✓ tulip://tokens/demo: primary 600 #2563eb, heading "Inter Display"
     ✓ compile_component data-table → DemoDataTable (182 lines, 0 governance violations)
   ```

## 3. Option B: local HTTP with `TULIP_API_KEY` (Tulip team)

### 3.1 Configure and start the server

```bash
cd mcp-server
cp .env.example .env          # .env is gitignored
# Edit .env and set SUPABASE_SERVICE_ROLE_KEY
# (Supabase dashboard → tulip-db → Project settings → API keys).
npm run start:http:local      # listens on http://127.0.0.1:3333/mcp
```

Leave it running. `.env.example` documents each variable, and the server exits with a clear message if one is missing or invalid.

### 3.2 Mint a test key

Use a short-lived `test` key scoped to the clients you need:

```bash
node --env-file=.env scripts/create-api-key.mjs \
  --test --label "Cursor – <your name>" --client demo --expires-days 7
```

The key (`tulip_test_…`) is printed once. Only its SHA-256 hash is stored in `public.api_keys`.

### 3.3 Set `TULIP_API_KEY` where Cursor can read it

The manifest sends the key as `x-tulip-api-key: ${env:TULIP_API_KEY}`. Cursor fills this in from its **own** process environment. On macOS, Cursor started from the Dock or Spotlight does **not** see variables exported in your shell profile. Use one of these:

- **Launch Cursor from a terminal** (recommended): the variable lasts only for that Cursor session.

  ```bash
  export TULIP_API_KEY='tulip_test_…'
  cursor /path/to/customer
  ```

  If the `cursor` command is missing, install it from the Command Palette: **Shell Command: Install 'cursor' command**.

- **Set it for your login session**: it lasts until you log out. Fully quit and reopen Cursor afterwards.

  ```bash
  launchctl setenv TULIP_API_KEY 'tulip_test_…'
  ```

Never paste the key into `.cursor/mcp.json`: that file is committed.

### 3.4 Enable and verify

1. In **Cursor Settings → MCP**, disable `tulip` and enable `tulip-http-local`.
2. In the same terminal, with `TULIP_API_KEY` exported:

   ```bash
   npm run verify -- --server tulip-http-local
   ```

   This should show the same three ✓ lines as Option A. The HTTP server reads published tokens from tulip-db. `.env.example` sets `TULIP_TOKENS_FALLBACK_DIR=./tokens`, so `demo` and any other client with nothing published is served from `mcp-server/tokens/` instead. The key only sees its own clients, so `clients visible` lists exactly the `--client` values you minted it with.

## 4. Try it in Cursor chat

With either server enabled, ask Cursor's agent, for example:

- **Token query:** "Read the `tulip://tokens/demo` resource and summarise the primary colour scale and font stacks."
- **Compilation:** "Use `compile_component` to build a `stats-grid` for client `demo` named `RevenueStats` with title 'Revenue', and save it to the file it suggests."

Supported `component_type` values are `data-table`, `stats-grid`, `form-wizard`, `navigation-sidebar` and `modal-dialog`. Generated files import from `@/components/ui/*` and `lucide-react`. They follow the governance rules in the [README](README.md#taste-governance) and are rejected rather than returned if they break one.

## Adding a design partner's tokens

The HTTP server only serves what operators have published. It reads `public.client_token_sets` and `public.component_blocks` in tulip-db (see the [README](README.md#where-tokens-and-blocks-come-from)).

1. In the Operator Taste Dashboard, register a component block for the client, using a lowercase slug client id such as `acme-corp`. Its tokens must match `ThemeTokensSchema` in `lib/token-schema.ts`; `tokens/demo.json` is a complete example.
2. Review the block and publish it. That writes the client's tokens and the approved block.
3. For HTTP access, mint a key with `--client <client-id>`, then check it: `npm run verify -- --server tulip-http-local --client <client-id>`.

The local stdio server (`tulip`) reads `mcp-server/tokens/<client-id>.json` instead when `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` aren't set. Use that to try a token file before an operator publishes it: `npm run verify -- --server tulip --client <client-id>`.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Cannot find module …/dist/index.js` or the stdio server won't start | Run `npm install && npm run build` in `mcp-server/` |
| `TULIP_API_KEY is not set` from `verify` | Export it in that terminal (step 3.3) |
| `connection refused` | Start the server: `npm run start:http:local` |
| `Invalid, expired or revoked API key` | Mint a new key (step 3.2), then re-export it and relaunch Cursor |
| Works in `verify` but not in Cursor | Cursor can't see the variable: relaunch it from the terminal where it's exported (step 3.3) |
| `This API key is not authorized for client "…"` | The key wasn't minted for that client; mint one with `--client <id>` |
| `No token definition found for client "…"` over HTTP | Nothing is published for that client and there's no `mcp-server/tokens/<id>.json`; check `TULIP_TOKENS_FALLBACK_DIR` in `.env`, or publish a block for it in the Operator Taste Dashboard |
| `API key verification is temporarily unavailable` (503) | The server can't reach Supabase; check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env` |
| Port 3333 already in use | Change `PORT` in `.env` and the `url` in `.cursor/mcp.json` to the same value |

## Revoking a key

Set `revoked_at` on its row in `public.api_keys` (Supabase table editor or SQL):

```sql
update public.api_keys set revoked_at = now() where key_prefix = 'tulip_test_Ab12';
```

The local server has a 5-second cache, so the key is rejected within that time.
