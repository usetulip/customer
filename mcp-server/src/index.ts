import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CompileComponentInputSchema,
  CompileComponentOutputSchema,
  GovernanceError,
  compileComponent,
} from "./compiler.ts";
import { TOKENS_DIR, TokenLoadError, listClientIds, loadClientTokens } from "./tokens.ts";

// stdout carries the MCP protocol; all logging goes to stderr.
const log = (...args: unknown[]) => console.error("[tulip-mcp]", ...args);

const server = new McpServer({ name: "tulip", version: "0.1.0" });

server.registerResource(
  "client-tokens",
  new ResourceTemplate("tulip://tokens/{client_id}", {
    list: async () => ({
      resources: (await listClientIds()).map((id) => ({
        uri: `tulip://tokens/${id}`,
        name: `${id} theme tokens`,
        mimeType: "application/json",
      })),
    }),
    complete: {
      client_id: async (value) =>
        (await listClientIds()).filter((id) => id.startsWith(value)),
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
      if (err instanceof TokenLoadError || err instanceof GovernanceError) {
        return { isError: true, content: [{ type: "text", text: err.message }] };
      }
      throw err;
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
log(`ready on stdio (tokens: ${TOKENS_DIR})`);
