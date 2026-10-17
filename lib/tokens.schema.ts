import { z } from "zod";

// --- Primitives ---
export const ColorHexSchema = z
  .string()
  .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, "Must be a valid hex color code");

export const SpacingValueSchema = z
  .string()
  .regex(/^-?\d+(\.\d+)?(px|rem|em|%)$/, "Must be a valid CSS unit (px, rem, em, %)");

// --- Token Category Schemas ---
export const ColorPaletteSchema = z.object({
  primary: ColorHexSchema,
  secondary: ColorHexSchema,
  background: ColorHexSchema,
  foreground: ColorHexSchema,
  accent: ColorHexSchema.optional(),
  muted: ColorHexSchema.optional(),
});

export const TypographySchema = z.object({
  fontFamilyHeading: z.string().min(1, "Heading font family is required"),
  fontFamilyBody: z.string().min(1, "Body font family is required"),
  baseFontSize: SpacingValueSchema.default("16px"),
  lineHeight: z.number().positive().default(1.5),
});

export const SpacingScaleSchema = z.object({
  xs: SpacingValueSchema,
  sm: SpacingValueSchema,
  md: SpacingValueSchema,
  lg: SpacingValueSchema,
  xl: SpacingValueSchema,
});

// --- Master Brand Token Schema ---
export const BrandTokenSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string(),
  brandName: z.string().min(1, "Brand name is required"),
  colors: ColorPaletteSchema,
  typography: TypographySchema,
  spacing: SpacingScaleSchema,
  borderRadius: SpacingValueSchema.default("0.375rem"),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

// --- Type Exports Inferred from Zod ---
export type ColorPalette = z.infer<typeof ColorPaletteSchema>;
export type Typography = z.infer<typeof TypographySchema>;
export type SpacingScale = z.infer<typeof SpacingScaleSchema>;
export type BrandTokens = z.infer<typeof BrandTokenSchema>;
