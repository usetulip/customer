import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CompileComponentInputSchema,
  CompileComponentOutputSchema,
  GovernanceError,
  compileComponent,
} from "./compiler.ts";
import { TokenLoadError, listClientIds, loadClientTokens } from "./tokens.ts";

/**
 * Which clients' tokens a connection may use. Local stdio is trusted with
 * every client; HTTP connections are limited to their API key's clients.
 */
export type ClientScope = "all" | ReadonlySet<string>;

export class ClientAccessError extends Error {
  constructor(clientId: string) {
    super(`This API key is not authorized for client "${clientId}"`);
  }
}

function assertClientAccess(scope: ClientScope, clientId: string) {
  if (scope !== "all" && !scope.has(clientId)) {
    throw new ClientAccessError(clientId);
  }
}

async function visibleClientIds(scope: ClientScope) {
  const ids = await listClientIds();
  return scope === "all" ? ids : ids.filter((id) => scope.has(id));
}

export function createTulipServer(scope: ClientScope) {
  const server = new McpServer({ name: "tulip", version: "0.2.0" });

  server.registerResource(
    "client-tokens",
    new ResourceTemplate("tulip://tokens/{client_id}", {
      list: async () => ({
        resources: (await visibleClientIds(scope)).map((id) => ({
          uri: `tulip://tokens/${id}`,
          name: `${id} theme tokens`,
          mimeType: "application/json",
        })),
      }),
      complete: {
        client_id: async (value) =>
          (await visibleClientIds(scope)).filter((id) => id.startsWith(value)),
      },
    }),
    {
      title: "Client theme tokens",
      description:
        "Read-only theme tokens for a client, validated against lib/token-schema.ts (ThemeTokensSchema).",
      mimeType: "application/json",
    },
    async (uri, { client_id }) => {
      const clientId = Array.isArray(client_id) ? client_id[0] : client_id;
      assertClientAccess(scope, clientId);
      // Errors propagate as JSON-RPC errors to the client.
      const tokens = await loadClientTokens(clientId);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(tokens, null, 2),
          },
        ],
      };
    },
  );

  server.registerTool(
    "compile_component",
    {
      title: "Compile governed component",
      description:
        "Compile a typed shadcn/Tailwind React component themed with a client's tokens. " +
        "Output follows Tulip taste governance: button icons size-4 (size-5 in large buttons and nav), " +
        "--font-heading/--font-body bindings, and ring-2 ring-primary focus rings on every interactive element.",
      inputSchema: CompileComponentInputSchema,
      outputSchema: CompileComponentOutputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (input) => {
      try {
        assertClientAccess(scope, input.client_id);
        const tokens = await loadClientTokens(input.client_id);
        const result = compileComponent(input, tokens);
        return {
          content: [
            {
              type: "text",
              text: `Compiled ${result.component_name} → ${result.file_name}\nshadcn components: ${result.dependencies.shadcn.join(", ")}\n\n\`\`\`tsx\n${result.code}\`\`\``,
            },
          ],
          structuredContent: result,
        };
      } catch (err) {
        if (
          err instanceof ClientAccessError ||
          err instanceof TokenLoadError ||
          err instanceof GovernanceError
        ) {
          return { isError: true, content: [{ type: "text", text: err.message }] };
        }
        throw err;
      }
    },
  );

  return server;
}
