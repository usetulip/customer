import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createTulipServer } from "./server.ts";
import { TOKENS_DIR } from "./tokens.ts";

// Local stdio entry point. The process is spawned by the user's own editor,
// so it is trusted with every client and needs no API key.

// stdout carries the MCP protocol; all logging goes to stderr.
const log = (...args: unknown[]) => console.error("[tulip-mcp]", ...args);

const server = createTulipServer("all");
await server.connect(new StdioServerTransport());
log(`ready on stdio (tokens: ${TOKENS_DIR})`);
