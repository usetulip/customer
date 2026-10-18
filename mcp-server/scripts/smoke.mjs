// End-to-end check over real stdio: spawns dist/index.js in local-files mode
// (no Supabase credentials) and exercises the resource templates and
// compile_component. smoke-http.mjs covers the Supabase-backed store. Generated files are written to
// SMOKE_OUT_DIR when set, so they can be type-checked inside the Next app.
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const results = [];
function check(name, ok, detail = "") {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function connect(env = {}) {
  const client = new Client({ name: "tulip-smoke", version: "0.0.0" });
  const baseEnv = { ...process.env };
  delete baseEnv.SUPABASE_URL;
  delete baseEnv.SUPABASE_SERVICE_ROLE_KEY;
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ["dist/index.js"],
      env: { ...baseEnv, ...env },
      stderr: "ignore",
    }),
  );
  return client;
}

const client = await connect();

const { tools } = await client.listTools();
const tool = tools.find((t) => t.name === "compile_component");
check("tool is listed", Boolean(tool));
check(
  "input schema enumerates component types",
  JSON.stringify(tool?.inputSchema.properties.component_type.enum) ===
    JSON.stringify(["data-table", "stats-grid", "form-wizard", "navigation-sidebar", "modal-dialog"]),
);
check("input schema is strict", tool?.inputSchema.additionalProperties === false);

const { resourceTemplates } = await client.listResourceTemplates();
check("resource template is listed", resourceTemplates.some((t) => t.uriTemplate === "tulip://tokens/{client_id}"));
check("blocks template is listed", resourceTemplates.some((t) => t.uriTemplate === "tulip://blocks/{client_id}"));

const localBlocks = JSON.parse((await client.readResource({ uri: "tulip://blocks/demo" })).contents[0].text);
check("local files mode publishes no blocks", localBlocks.client_id === "demo" && localBlocks.blocks.length === 0);

const { resources } = await client.listResources();
check("demo client is listed", resources.some((r) => r.uri === "tulip://tokens/demo"));

const read = await client.readResource({ uri: "tulip://tokens/demo" });
const tokens = JSON.parse(read.contents[0].text);
check("resource returns validated tokens", tokens.version === 1 && tokens.colors.primary["600"] === "#2563eb");

try {
  await client.readResource({ uri: "tulip://tokens/nope" });
  check("unknown client is rejected", false);
} catch (err) {
  check("unknown client is rejected", /No token definition/.test(err.message));
}

try {
  await client.readResource({ uri: "tulip://tokens/..%2F..%2Fpackage" });
  check("path traversal is rejected", false);
} catch (err) {
  check("path traversal is rejected", /lowercase slug/.test(err.message), err.message.split("\n")[0]);
}

const outDir = process.env.SMOKE_OUT_DIR;
if (outDir) await mkdir(outDir, { recursive: true });

for (const component_type of ["data-table", "stats-grid", "form-wizard", "navigation-sidebar", "modal-dialog"]) {
  const res = await client.callTool({
    name: "compile_component",
    arguments: {
      component_type,
      client_id: "demo",
      custom_requirements: { notes: ["Smoke test */ build"], density: "compact" },
    },
  });
  const out = res.structuredContent;
  const ok =
    !res.isError &&
    out?.governance.violations.length === 0 &&
    out.code.includes("focus-visible:ring-2 focus-visible:ring-primary") &&
    out.code.includes("--font-heading") &&
    out.code.includes('"--primary": "#2563eb"');
  check(`compile ${component_type}`, ok, out?.file_name);
  if (outDir && out) await writeFile(join(outDir, `${component_type}.tsx`), out.code);
}

const bad = await client.callTool({
  name: "compile_component",
  arguments: { component_type: "carousel", client_id: "demo" },
});
check("unknown component_type is rejected", bad.isError === true);

const extra = await client.callTool({
  name: "compile_component",
  arguments: { component_type: "data-table", client_id: "demo", custom_requirements: { colour: "red" } },
});
check("unknown custom_requirements key is rejected", extra.isError === true);

const injected = await client.callTool({
  name: "compile_component",
  arguments: {
    component_type: "modal-dialog",
    client_id: "demo",
    custom_requirements: { title: 'Delete "all" </div>{alert(1)}' },
  },
});
check(
  "titles are emitted as string literals",
  !injected.isError && injected.structuredContent.code.includes('title = "Delete \\"all\\" </div>{alert(1)}"'),
);

await client.close();

// A token file that fails ThemeTokensSchema is reported, not served.
const brokenDir = await mkdtemp(join(tmpdir(), "tulip-tokens-"));
await writeFile(join(brokenDir, "broken.json"), JSON.stringify({ version: 1, colors: {} }));
const brokenClient = await connect({ TULIP_TOKENS_DIR: brokenDir });
const broken = await brokenClient.callTool({
  name: "compile_component",
  arguments: { component_type: "data-table", client_id: "broken" },
});
check("invalid token file is reported", broken.isError === true && /failed validation/.test(broken.content[0].text));
await brokenClient.close();

const failed = results.filter((ok) => !ok).length;
console.log(failed ? `\n${failed} failed` : `\nall ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
