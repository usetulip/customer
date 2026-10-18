import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createTulipServer } from "./server.ts";
import { storeFromEnv } from "./tokens.ts";

// Local stdio entry point. The process is spawned by the user's own editor,
// so it is trusted with every client and needs no API key. With SUPABASE_URL
// and SUPABASE_SERVICE_ROLE_KEY set it serves published state from tulip-db;
// otherwise it reads local token files.

// stdout carries the MCP protocol; all logging goes to stderr.
const log = (...args: unknown[]) => console.error("[tulip-mcp]", ...args);

const store = storeFromEnv();
const server = createTulipServer("all", store);
await server.connect(new StdioServerTransport());
log(`ready on stdio (tokens: ${store.description})`);
