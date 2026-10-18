import { build } from "esbuild";

// Bundle src/ plus ../lib/token-schema.ts into one ESM file. Packages stay
// external so `zod` and the SDK resolve from this package's node_modules.
await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  packages: "external",
  external: ["zod", "@modelcontextprotocol/sdk"],
  banner: { js: "#!/usr/bin/env node" },
  logLevel: "info",
});
