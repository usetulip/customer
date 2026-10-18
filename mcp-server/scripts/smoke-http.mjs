// End-to-end check of the Streamable HTTP service: spawns dist/http.js against
// a mock Supabase REST endpoint and drives it with raw requests and the MCP
// client. Covers the x-tulip-api-key middleware and per-key client scoping.
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { copyFile, mkdtemp } from "node:fs/promises";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const results = [];
function check(name, ok, detail = "") {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

const newKey = () => `tulip_test_${randomBytes(32).toString("base64url")}`;
const sha = (key) => createHash("sha256").update(key).digest("hex");

const keys = {
  demo: newKey(),
  revoked: newKey(),
  expired: newKey(),
  outage: newKey(),
};
const rows = new Map([
  [sha(keys.demo), { id: "00000000-0000-0000-0000-000000000001", client_ids: ["demo"], revoked_at: null, expires_at: null }],
  [sha(keys.revoked), { id: "00000000-0000-0000-0000-000000000002", client_ids: ["demo"], revoked_at: "2026-01-01T00:00:00Z", expires_at: null }],
  [sha(keys.expired), { id: "00000000-0000-0000-0000-000000000003", client_ids: ["demo"], revoked_at: null, expires_at: "2026-01-01T00:00:00Z" }],
]);
const lookups = new Map();
let patches = 0;

// --- Mock Supabase PostgREST (only what the verifier calls) ---
const mock = createServer((req, res) => {
  const url = new URL(req.url, "http://mock");
  if (req.headers.apikey !== "mock-service-role-key-000000") {
    res.writeHead(401).end();
    return;
  }
  if (req.method === "PATCH") {
    patches++;
    res.writeHead(204).end();
    return;
  }
  const hash = url.searchParams.get("key_hash")?.replace(/^eq\./, "");
  lookups.set(hash, (lookups.get(hash) ?? 0) + 1);
  if (hash === sha(keys.outage)) {
    res.writeHead(500).end();
    return;
  }
  const row = rows.get(hash);
  res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(row ? [row] : []));
});
await new Promise((resolve) => mock.listen(0, "127.0.0.1", resolve));
const mockUrl = `http://127.0.0.1:${mock.address().port}`;

// Two clients on disk; the demo key may only use "demo".
const tokensDir = await mkdtemp(join(tmpdir(), "tulip-tokens-"));
await copyFile("tokens/demo.json", join(tokensDir, "demo.json"));
await copyFile("tokens/demo.json", join(tokensDir, "acme.json"));

const port = await new Promise((resolve) => {
  const probe = createServer().listen(0, "127.0.0.1", () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});
const base = `http://127.0.0.1:${port}`;

const child = spawn(process.execPath, ["dist/http.js"], {
  env: {
    ...process.env,
    SUPABASE_URL: mockUrl,
    SUPABASE_SERVICE_ROLE_KEY: "mock-service-role-key-000000",
    PORT: String(port),
    HOST: "127.0.0.1",
    TULIP_TOKENS_DIR: tokensDir,
  },
  stdio: ["ignore", "ignore", "pipe"],
});
let stderr = "";
child.stderr.on("data", (chunk) => (stderr += chunk));

try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`${base}/healthz`)).ok) break;
    } catch {}
    if (i > 50) throw new Error(`server did not start:\n${stderr}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  check("health check is public", (await fetch(`${base}/healthz`)).status === 200);

  const initialize = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "0" } },
  };
  const post = (headers, body = initialize) =>
    fetch(`${base}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  let res = await post({});
  let body = await res.json();
  check("missing key → 401", res.status === 401 && /Missing x-tulip-api-key/.test(body.error?.message));

  const lookupsBefore = [...lookups.values()].reduce((a, b) => a + b, 0);
  res = await post({ "x-tulip-api-key": "not-a-key" });
  const lookupsAfter = [...lookups.values()].reduce((a, b) => a + b, 0);
  check("malformed key → 401 without a DB lookup", res.status === 401 && lookupsAfter === lookupsBefore);

  res = await post({ "x-tulip-api-key": newKey() });
  check("unknown key → 401", res.status === 401);
  res = await post({ "x-tulip-api-key": keys.revoked });
  check("revoked key → 401", res.status === 401);
  res = await post({ "x-tulip-api-key": keys.expired });
  check("expired key → 401", res.status === 401);
  res = await post({ "x-tulip-api-key": keys.outage });
  check("key store outage → 503 (fails closed)", res.status === 503);

  res = await fetch(`${base}/mcp`, { method: "GET" });
  check("GET without key → 401 (auth runs first)", res.status === 401);
  res = await fetch(`${base}/mcp`, { method: "GET", headers: { "x-tulip-api-key": keys.demo } });
  check("GET with key → 405 (stateless)", res.status === 405 && res.headers.get("allow") === "POST");

  res = await post({ "x-tulip-api-key": keys.demo });
  const sse = await res.text();
  check(
    "valid key → initialize streams over SSE",
    res.status === 200 &&
      res.headers.get("content-type")?.startsWith("text/event-stream") &&
      /"serverInfo":\{"name":"tulip"/.test(sse),
  );

  // Declare an oversized body but don't send it: the server must reject on
  // Content-Length alone, before reading anything.
  const oversized = await new Promise((resolve, reject) => {
    const req = request(`${base}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(8 * 1024 * 1024),
        "x-tulip-api-key": keys.demo,
      },
    });
    req.on("response", (r) => {
      resolve({ status: r.statusCode, connection: r.headers.connection });
      req.destroy();
    });
    req.on("error", reject);
    req.flushHeaders();
  });
  check(
    "oversized body → 413 before upload",
    oversized.status === 413 && oversized.connection === "close",
  );

  // MCP client over Streamable HTTP with the demo-scoped key.
  const client = new Client({ name: "tulip-smoke-http", version: "0.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
      requestInit: { headers: { "x-tulip-api-key": keys.demo } },
    }),
  );

  const { tools } = await client.listTools();
  check("tools/list over HTTP", tools.some((t) => t.name === "compile_component"));

  const { resources } = await client.listResources();
  check(
    "resource list is scoped to the key's clients",
    resources.map((r) => r.uri).join() === "tulip://tokens/demo",
    resources.map((r) => r.uri).join(", "),
  );

  const read = await client.readResource({ uri: "tulip://tokens/demo" });
  check("read allowed client tokens", JSON.parse(read.contents[0].text).version === 1);

  try {
    await client.readResource({ uri: "tulip://tokens/acme" });
    check("read other client's tokens is refused", false);
  } catch (err) {
    check("read other client's tokens is refused", /not authorized for client "acme"/.test(err.message));
  }

  const compiled = await client.callTool({
    name: "compile_component",
    arguments: { component_type: "stats-grid", client_id: "demo" },
  });
  check(
    "compile for allowed client",
    !compiled.isError && compiled.structuredContent.governance.violations.length === 0,
  );

  const denied = await client.callTool({
    name: "compile_component",
    arguments: { component_type: "stats-grid", client_id: "acme" },
  });
  check(
    "compile for other client is refused",
    denied.isError === true && /not authorized for client "acme"/.test(denied.content[0].text),
  );
  await client.close();

  check(
    "valid key is cached (one lookup for many requests)",
    lookups.get(sha(keys.demo)) === 1,
    `${lookups.get(sha(keys.demo))} lookups`,
  );
  check("last_used_at is updated", patches >= 1);
  check("no secrets in server logs", !stderr.includes(keys.demo) && !stderr.includes("mock-service-role"));
} finally {
  child.kill("SIGTERM");
  mock.close();
}

const failed = results.filter((ok) => !ok).length;
console.log(failed ? `\n${failed} failed` : `\nall ${results.length} HTTP checks passed`);
process.exit(failed ? 1 : 0);
