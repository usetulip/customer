import { pgTable, text, timestamp, uuid, jsonb } from "drizzle-orm/pg-core";
import { BrandTokens } from "../lib/tokens.schema";

export const brandTokensTable = pgTable("brand_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id").notNull(),
  brandName: text("brand_name").notNull(),
  
  // Strongly-typed JSONB column for token definitions
  tokens: jsonb("tokens").$type<BrandTokens>().notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
