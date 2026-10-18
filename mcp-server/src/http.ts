import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";
import { API_KEY_HEADER, type ApiKeyVerifier, type VerifiedApiKey } from "./api-keys.ts";
import { createTulipServer } from "./server.ts";

// Streamable HTTP in stateless mode: every POST gets a fresh McpServer scoped
// to the caller's API key, so instances can scale horizontally and need no
// sticky sessions. Responses stream as SSE.

const MAX_BODY_BYTES = 1024 * 1024;

const log = (...args: unknown[]) => console.error("[tulip-mcp]", ...args);

function jsonRpcError(code: number, message: string) {
  return { jsonrpc: "2.0" as const, error: { code, message }, id: null };
}

type Env = { Variables: { apiKey: VerifiedApiKey } };

export function createHttpApp({ verifyApiKey }: { verifyApiKey: ApiKeyVerifier }) {
  const app = new Hono<Env>();

  // Runs before the MCP server exists, so no tool or resource is resolved
  // for a request that hasn't presented a valid key.
  const requireApiKey = createMiddleware<Env>(async (c, next) => {
    const key = c.req.header(API_KEY_HEADER);
    if (!key) {
      return c.json(jsonRpcError(-32001, `Missing ${API_KEY_HEADER} header`), 401);
    }

    let verified: VerifiedApiKey | null;
    try {
      verified = await verifyApiKey(key);
    } catch (err) {
      log("API key verification unavailable:", (err as Error).message);
      return c.json(jsonRpcError(-32002, "API key verification is temporarily unavailable"), 503);
    }

    if (!verified) {
      return c.json(jsonRpcError(-32001, "Invalid, expired or revoked API key"), 401);
    }

    c.set("apiKey", verified);
    await next();
  });

  app.get("/healthz", (c) => c.json({ ok: true }));

  app.all(
    "/mcp",
    requireApiKey,
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      // The unread body leaves the socket unusable; tell the client not to reuse it.
      onError: (c) =>
        c.json(jsonRpcError(-32600, "Request body too large"), 413, { Connection: "close" }),
    }),
    async (c) => {
      // Stateless mode has no session to resume (GET) or terminate (DELETE).
      if (c.req.method !== "POST") {
        c.header("Allow", "POST");
        return c.json(jsonRpcError(-32000, "Method not allowed; this server is stateless, use POST"), 405);
      }

      const server = createTulipServer(c.get("apiKey").clientIds);
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await server.connect(transport);
      return transport.handleRequest(c.req.raw);
    },
  );

  app.notFound((c) => c.json({ error: "Not found" }, 404));
  app.onError((err, c) => {
    log("unhandled error:", err);
    return c.json(jsonRpcError(-32603, "Internal server error"), 500);
  });

  return app;
}
