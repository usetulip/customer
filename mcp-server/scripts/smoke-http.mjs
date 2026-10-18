// End-to-end check of the Streamable HTTP service: spawns dist/http.js against
// a mock Supabase REST endpoint and drives it with raw requests and the MCP
// client. Covers the x-tulip-api-key middleware, per-key client scoping, and
// serving published tokens and blocks from client_token_sets / component_blocks.
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, request } from "node:http";
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
  broken: newKey(),
  fallback: newKey(),
};
const rows = new Map([
  [sha(keys.demo), { id: "00000000-0000-0000-0000-000000000001", client_ids: ["demo"], revoked_at: null, expires_at: null }],
  [sha(keys.revoked), { id: "00000000-0000-0000-0000-000000000002", client_ids: ["demo"], revoked_at: "2026-01-01T00:00:00Z", expires_at: null }],
  [sha(keys.expired), { id: "00000000-0000-0000-0000-000000000003", client_ids: ["demo"], revoked_at: null, expires_at: "2026-01-01T00:00:00Z" }],
  [sha(keys.broken), { id: "00000000-0000-0000-0000-000000000004", client_ids: ["broken"], revoked_at: null, expires_at: null }],
]);
const lookups = new Map();
let patches = 0;

// Published state, as the operator dashboard writes it.
const demoTokens = JSON.parse(await readFile("tokens/demo.json", "utf8"));
const tokenSets = new Map([
  ["demo", demoTokens],
  ["acme", demoTokens],
  ["broken", { version: 1, colors: {} }],
]);
const blockRows = [
  {
    id: "10000000-0000-0000-0000-000000000001",
    client_id: "demo",
    name: "Billing overview",
    archetype: "saas-dashboard",
    published_version: 2,
    published_hash: "a".repeat(64),
    published_at: "2026-10-18T00:00:00Z",
    published_source: "export function BillingOverview() {}",
  },
];
const blockQueries = [];
let storeDown = false;

const json = (res, body) => res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(body));
const eqParam = (url, name) => url.searchParams.get(name)?.replace(/^eq\./, "");

// --- Mock Supabase PostgREST (only what the server calls) ---
const mock = createServer((req, res) => {
  const url = new URL(req.url, "http://mock");
  if (req.headers.apikey !== "mock-service-role-key-000000") {
    res.writeHead(401).end();
    return;
  }
  if (url.pathname === "/rest/v1/client_token_sets" || url.pathname === "/rest/v1/component_blocks") {
    if (storeDown) {
      res.writeHead(500).end();
      return;
    }
    const clientId = eqParam(url, "client_id");
    if (url.pathname === "/rest/v1/component_blocks") {
      blockQueries.push(url.search);
      // Only published rows match `published_at=not.is.null`.
      const published = url.searchParams.get("published_at") === "not.is.null";
      json(res, blockRows.filter((row) => row.client_id === clientId && published));
      return;
    }
    if (!clientId) {
      json(res, [...tokenSets.keys()].sort().map((id) => ({ client_id: id })));
      return;
    }
    json(res, tokenSets.has(clientId) ? [{ tokens: tokenSets.get(clientId) }] : []);
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

const port = await new Promise((resolve) => {
  const probe = createServer().listen(0, "127.0.0.1", () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});
const base = `http://127.0.0.1:${port}`;

function startServer(port, extraEnv = {}) {
  const env = {
    ...process.env,
    SUPABASE_URL: mockUrl,
    SUPABASE_SERVICE_ROLE_KEY: "mock-service-role-key-000000",
    PORT: String(port),
    HOST: "127.0.0.1",
    ...extraEnv,
  };
  if (!extraEnv.TULIP_TOKENS_FALLBACK_DIR) delete env.TULIP_TOKENS_FALLBACK_DIR;
  const proc = spawn(process.execPath, ["dist/http.js"], {
    env,
    stdio: ["ignore", "ignore", "pipe"],
  });
  proc.output = "";
  proc.stderr.on("data", (chunk) => (proc.output += chunk));
  return proc;
}

async function waitForHealth(url, proc) {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`${url}/healthz`)).ok) return;
    } catch {}
    if (i > 50) throw new Error(`server did not start:\n${proc.output}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

const freePort = () =>
  new Promise((resolve) => {
    const probe = createServer().listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

const child = startServer(port);

try {
  await waitForHealth(base, child);
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
    resources.map((r) => r.uri).sort().join() === "tulip://blocks/demo,tulip://tokens/demo",
    resources.map((r) => r.uri).join(", "),
  );

  const read = await client.readResource({ uri: "tulip://tokens/demo" });
  const served = JSON.parse(read.contents[0].text);
  check(
    "tokens are served from client_token_sets",
    served.version === 1 && served.colors.primary["600"] === demoTokens.colors.primary["600"],
  );

  const blocksRead = JSON.parse((await client.readResource({ uri: "tulip://blocks/demo" })).contents[0].text);
  const [block] = blocksRead.blocks;
  check(
    "approved blocks are served with the published snapshot",
    blocksRead.blocks.length === 1 &&
      block.source === blockRows[0].published_source &&
      block.version === 2 &&
      block.hash === "a".repeat(64),
  );
  const blockQuery = new URLSearchParams(blockQueries.at(-1));
  check(
    "blocks query is limited to published rows and never selects source",
    blockQuery.get("published_at") === "not.is.null" &&
      !blockQuery.get("select").split(",").includes("source"),
    blockQueries.at(-1),
  );

  try {
    await client.readResource({ uri: "tulip://blocks/acme" });
    check("read other client's blocks is refused", false);
  } catch (err) {
    check("read other client's blocks is refused", /not authorized for client "acme"/.test(err.message));
  }

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

  storeDown = true;
  const outage = await client.callTool({
    name: "compile_component",
    arguments: { component_type: "stats-grid", client_id: "demo" },
  });
  storeDown = false;
  check(
    "token store outage is reported, not thrown",
    outage.isError === true && /HTTP 500/.test(outage.content[0].text),
  );
  await client.close();

  const brokenClient = new Client({ name: "tulip-smoke-http", version: "0.0.0" });
  await brokenClient.connect(
    new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
      requestInit: { headers: { "x-tulip-api-key": keys.broken } },
    }),
  );
  const broken = await brokenClient.callTool({
    name: "compile_component",
    arguments: { component_type: "stats-grid", client_id: "broken" },
  });
  check(
    "published tokens failing ThemeTokensSchema are not served",
    broken.isError === true && /failed validation/.test(broken.content[0].text),
  );
  await brokenClient.close();

  check(
    "valid key is cached (one lookup for many requests)",
    lookups.get(sha(keys.demo)) === 1,
    `${lookups.get(sha(keys.demo))} lookups`,
  );
  check("last_used_at is updated", patches >= 1);
  check("no secrets in server logs", !child.output.includes(keys.demo) && !child.output.includes("mock-service-role"));
} finally {
  child.kill("SIGTERM");
}

// Local development fallback: token files fill in unpublished clients only.
const fallbackDir = await mkdtemp(join(tmpdir(), "tulip-fallback-"));
await writeFile(join(fallbackDir, "local.json"), JSON.stringify(demoTokens));
const staleDemo = structuredClone(demoTokens);
staleDemo.colors.primary["600"] = "#1d4ed8";
await writeFile(join(fallbackDir, "demo.json"), JSON.stringify(staleDemo));
await writeFile(join(fallbackDir, "broken.json"), JSON.stringify(demoTokens));
rows.set(sha(keys.fallback), {
  id: "00000000-0000-0000-0000-000000000005",
  client_ids: ["demo", "local", "broken"],
  revoked_at: null,
  expires_at: null,
});

const fallbackPort = await freePort();
const fallbackBase = `http://127.0.0.1:${fallbackPort}`;
const fallbackChild = startServer(fallbackPort, { TULIP_TOKENS_FALLBACK_DIR: fallbackDir });
try {
  await waitForHealth(fallbackBase, fallbackChild);
  const client = new Client({ name: "tulip-smoke-fallback", version: "0.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${fallbackBase}/mcp`), {
      requestInit: { headers: { "x-tulip-api-key": keys.fallback } },
    }),
  );
  const tokensOf = async (id) =>
    JSON.parse((await client.readResource({ uri: `tulip://tokens/${id}` })).contents[0].text);

  check("fallback: unpublished client is served from files", (await tokensOf("local")).version === 1);
  check(
    "fallback: published tokens win over files",
    (await tokensOf("demo")).colors.primary["600"] === demoTokens.colors.primary["600"],
  );
  try {
    await tokensOf("broken");
    check("fallback: invalid published tokens are not masked by a file", false);
  } catch (err) {
    check("fallback: invalid published tokens are not masked by a file", /failed validation/.test(err.message));
  }
  const { resources } = await client.listResources();
  check(
    "fallback: listing merges published and file clients",
    resources.some((r) => r.uri === "tulip://tokens/local") && resources.some((r) => r.uri === "tulip://tokens/demo"),
  );
  check("fallback: startup warns it is development only", /development only/.test(fallbackChild.output));
  await client.close();
} finally {
  fallbackChild.kill("SIGTERM");
  mock.close();
}

const failed = results.filter((ok) => !ok).length;
console.log(failed ? `\n${failed} failed` : `\nall ${results.length} HTTP checks passed`);
process.exit(failed ? 1 : 0);
