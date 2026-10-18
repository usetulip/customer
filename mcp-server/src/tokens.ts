import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { ThemeTokensSchema, type ThemeTokens } from "../../lib/token-schema.ts";

// Client token definitions are JSON files named `<client_id>.json`.
// TULIP_TOKENS_DIR overrides the bundled ../tokens directory.
export const TOKENS_DIR = process.env.TULIP_TOKENS_DIR
  ? resolve(process.env.TULIP_TOKENS_DIR)
  : resolve(dirname(fileURLToPath(import.meta.url)), "../tokens");

// Restricting ids to a slug keeps lookups inside TOKENS_DIR.
export const ClientIdSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,62}$/, "client_id must be a lowercase slug, e.g. acme-corp");

export class TokenLoadError extends Error {}

export async function listClientIds() {
  let entries: string[];
  try {
    entries = await readdir(TOKENS_DIR);
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => entry.slice(0, -".json".length))
    .filter((id) => ClientIdSchema.safeParse(id).success)
    .sort();
}

export async function loadClientTokens(clientId: string): Promise<ThemeTokens> {
  const id = ClientIdSchema.safeParse(clientId);
  if (!id.success) {
    throw new TokenLoadError(z.prettifyError(id.error));
  }

  let raw: string;
  try {
    raw = await readFile(join(TOKENS_DIR, `${id.data}.json`), "utf8");
  } catch {
    throw new TokenLoadError(`No token definition found for client "${id.data}"`);
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new TokenLoadError(
      `Token file for "${id.data}" is not valid JSON: ${(err as Error).message}`,
    );
  }

  const parsed = ThemeTokensSchema.safeParse(json);
  if (!parsed.success) {
    throw new TokenLoadError(
      `Token file for "${id.data}" failed validation:\n${z.prettifyError(parsed.error)}`,
    );
  }
  return parsed.data;
}
