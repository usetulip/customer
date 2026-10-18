// Checks .cursor/mcp.json the way Cursor uses it: resolves ${workspaceFolder}
// and ${env:NAME}, connects to each server, queries a client's tokens and
// compiles a component.
//
//   npm run verify                                  # every server in the manifest
//   npm run verify -- --server tulip-http-local     # one server
//   npm run verify -- --client demo --component stats-grid
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const { values } = parseArgs({
  options: {
    server: { type: "string", multiple: true },
    client: { type: "string" },
    component: { type: "string", default: "data-table" },
  },
});

const workspaceFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const manifestPath = resolve(workspaceFolder, ".cursor/mcp.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

class MissingEnvError extends Error {}

function interpolate(value) {
  return value
    .replaceAll("${workspaceFolder}", workspaceFolder)
    .replace(/\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name) => {
      if (!process.env[name]) throw new MissingEnvError(`${name} is not set`);
      return process.env[name];
    });
}

const mapValues = (object = {}, fn) =>
  Object.fromEntries(Object.entries(object).map(([key, value]) => [key, fn(value)]));

function transportFor(config) {
  if (config.url) {
    return new StreamableHTTPClientTransport(new URL(interpolate(config.url)), {
      requestInit: { headers: mapValues(config.headers, interpolate) },
    });
  }
  return new StdioClientTransport({
    command: interpolate(config.command),
    args: (config.args ?? []).map(interpolate),
    env: { ...process.env, ...mapValues(config.env, interpolate) },
    stderr: "ignore",
  });
}

function explain(err, config) {
  const message = err?.cause?.code === "ECONNREFUSED" ? "connection refused" : err.message;
  if (config.url && /refused|fetch failed/i.test(message)) {
    return `${message}. Is the HTTP server running? (cd mcp-server && npm run start:http:local)`;
  }
  if (/401|Invalid, expired or revoked|Missing x-tulip-api-key/.test(message)) {
    return `${message}. Check TULIP_API_KEY (mint one with npm run create-api-key).`;
  }
  if (/ENOENT|dist\/index\.js/.test(message)) {
    return `${message}. Build first: cd mcp-server && npm install && npm run build`;
  }
  return message;
}

async function verify(name, config) {
  const transport = transportFor(config);
  const client = new Client({ name: "tulip-verify", version: "0.0.0" });
  await client.connect(transport);
  try {
    const { resources } = await client.listResources();
    const clientIds = resources
      .filter((r) => r.uri.startsWith("tulip://tokens/"))
      .map((r) => r.uri.replace("tulip://tokens/", ""));
    if (!clientIds.length) throw new Error("no client tokens visible to this connection");

    const clientId = values.client ?? clientIds[0];
    const read = await client.readResource({ uri: `tulip://tokens/${clientId}` });
    const tokens = JSON.parse(read.contents[0].text);

    const result = await client.callTool({
      name: "compile_component",
      arguments: { component_type: values.component, client_id: clientId },
    });
    if (result.isError) throw new Error(result.content[0]?.text ?? "compile_component failed");
    const out = result.structuredContent;

    console.log(`  ✓ clients visible: ${clientIds.join(", ")}`);
    console.log(
      `  ✓ tulip://tokens/${clientId}: primary 600 ${tokens.colors.primary["600"]}, heading "${tokens.typography.heading[0]}"`,
    );
    console.log(
      `  ✓ compile_component ${values.component} → ${out.component_name} (${out.code.split("\n").length} lines, ${out.governance.violations.length} governance violations)`,
    );
  } finally {
    await client.close();
  }
}

const servers = Object.entries(manifest.mcpServers ?? {}).filter(
  ([name]) => !values.server || values.server.includes(name),
);
if (!servers.length) {
  console.error(`No matching servers in ${manifestPath}`);
  process.exit(1);
}

let failed = 0;
for (const [name, config] of servers) {
  console.log(`${name} (${config.url ? `HTTP ${config.url}` : `stdio ${config.command}`})`);
  try {
    await verify(name, config);
  } catch (err) {
    // A server that needs an unset env var is skipped unless it was asked for by name.
    if (err instanceof MissingEnvError && !values.server) {
      console.log(`  - skipped: ${err.message}`);
      continue;
    }
    failed++;
    console.log(`  ✗ ${explain(err, config)}`);
  }
}

process.exit(failed ? 1 : 0);
