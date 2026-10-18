// Mint an API key for the remote MCP server and store its hash in Supabase.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/create-api-key.mjs --label "Cursor – Alice" --client demo [--client acme] [--expires-days 90] [--test]
//
// The plaintext key is printed once and never stored.
import { createHash, randomBytes } from "node:crypto";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    label: { type: "string" },
    client: { type: "string", multiple: true },
    "expires-days": { type: "string" },
    test: { type: "boolean", default: false },
  },
});

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!values.label || !values.client?.length) {
  console.error('Usage: --label "<who/where>" --client <client_id> [--client ...] [--expires-days N] [--test]');
  process.exit(1);
}

const key = `tulip_${values.test ? "test" : "live"}_${randomBytes(32).toString("base64url")}`;
const expiresDays = values["expires-days"] ? Number(values["expires-days"]) : null;

const response = await fetch(`${SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/api_keys`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Prefer: "return=representation",
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    ...(SUPABASE_SERVICE_ROLE_KEY.startsWith("eyJ")
      ? { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }
      : {}),
  },
  body: JSON.stringify({
    label: values.label,
    key_prefix: key.slice(0, key.indexOf("_", 6) + 5),
    key_hash: createHash("sha256").update(key).digest("hex"),
    client_ids: values.client,
    expires_at: expiresDays ? new Date(Date.now() + expiresDays * 86_400_000).toISOString() : null,
  }),
});

if (!response.ok) {
  console.error(`Failed to store key (HTTP ${response.status}): ${await response.text()}`);
  process.exit(1);
}

const [row] = await response.json();
console.error(`Created key ${row.id} (${row.key_prefix}…) for ${row.client_ids.join(", ")}`);
console.error("Copy it now; it cannot be shown again:\n");
console.log(key);
