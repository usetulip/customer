import { build } from "esbuild";

// Bundle src/ plus ../lib/token-schema.ts. Packages stay external so `zod`,
// the SDK and Hono resolve from this package's node_modules.
await build({
  entryPoints: {
    index: "src/index.ts", // stdio (local, Cursor)
    http: "src/http-main.ts", // Streamable HTTP (remote, Render)
  },
  outdir: "dist",
  bundle: true,
  splitting: true,
  platform: "node",
  format: "esm",
  target: "node20",
  packages: "external",
  external: ["zod", "@modelcontextprotocol/sdk", "hono", "@hono/node-server"],
  banner: { js: "#!/usr/bin/env node" },
  logLevel: "info",
});
