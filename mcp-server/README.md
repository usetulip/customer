# Tulip MCP server (local stdio)

A local [Model Context Protocol](https://modelcontextprotocol.io) server that exposes client theme tokens and compiles taste-governed shadcn/Tailwind components. It is a standalone package: the Next app's `tsconfig.json` and ESLint config exclude this directory.

## Setup

```bash
cd mcp-server
npm install
npm run build
```

Then open the repo in Cursor. `.cursor/mcp.json` registers the `tulip` server, which runs `node mcp-server/dist/index.js` over stdio. Enable it under **Cursor Settings → MCP**. Rebuild after changing anything in `src/` or `../lib/token-schema.ts`.

| Script | What it does |
| --- | --- |
| `npm run build` | Bundles `src/` and `../lib/token-schema.ts` into `dist/index.js` (esbuild) |
| `npm run dev` | Runs the server from source with `tsx` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run smoke` | Builds, then drives the server over real stdio with the MCP client and checks the resource and tool end to end |

## Resource: `tulip://tokens/{client_id}`

Read-only. Loads `tokens/<client_id>.json` (or `$TULIP_TOKENS_DIR/<client_id>.json`) and validates it against `ThemeTokensSchema` from `lib/token-schema.ts`. Invalid files are reported with the Zod issues and never served. `client_id` must be a lowercase slug, which keeps lookups inside the tokens directory. Listing and `client_id` completion come from the files present. `tokens/demo.json` is a sample.

## Tool: `compile_component`

Input (strict; unknown keys are rejected):

```json
{
  "component_type": "data-table | stats-grid | form-wizard | navigation-sidebar | modal-dialog",
  "client_id": "demo",
  "custom_requirements": {
    "component_name": "AcmeInvoiceTable",
    "title": "Invoices",
    "description": "All invoices this quarter.",
    "density": "comfortable | compact",
    "notes": ["Rendered as JSDoc on the component"]
  }
}
```

`custom_requirements` and all of its fields are optional. The tool returns the code as text and as `structuredContent`: `component_name`, a suggested `file_name` under `components/generated/`, `code`, the shadcn components it imports, and the governance rules it was checked against.

The generated file is a typed client component that imports from `@/components/ui/*`, `@/lib/utils` and `lucide-react`. It sets the client's tokens as CSS variables (`--primary`, `--ring`, `--radius`, `--font-heading`, `--font-body`, plus the token file's component overrides) on its root element.

## Taste governance

The rules live in `src/governance.ts`. Templates build their markup from these constants, and every compile runs `auditTaste` on the emitted code, so output that breaks a rule fails with the list of violations instead of being returned.

- **Icons:** icons in buttons are `size-4`; icons in `size="lg"` buttons and navigation items are `size-5`. All decorative icons are `aria-hidden`.
- **Fonts:** headings use `font-(family-name:--font-heading)`, and the component root uses `font-(family-name:--font-body)`.
- **Focus:** every interactive element (`Button`, `Input`, `a`, `button`, `input`, `textarea`, `select`) carries `focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2`.
- **Colour:** no raw hex values in class names; colour comes from token variables.
