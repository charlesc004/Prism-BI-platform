import { config } from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";
config({ path: resolve(import.meta.dirname, "../../../../.env"), quiet: true });
export const env = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z
      .url()
      .refine(
        (value) => new URL(value).protocol === "postgresql:",
        "Expected a PostgreSQL connection URL",
      ),
    REDIS_URL: z
      .url()
      .refine(
        (value) => ["redis:", "rediss:"].includes(new URL(value).protocol),
        "Expected a Redis connection URL",
      ),
    WEB_ORIGIN: z.url(),
    SEED_REFERENCE_DATE: z.iso
      .date()
      .default(new Date().toISOString().slice(0, 10)),
    SEED_PASSWORD: z.string().min(12).optional(),
    SHOPIFY_DOMAIN: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/)
      .optional()
      .or(z.literal("")),
    SHOPIFY_TOKEN: z.string().optional(),
    SHOPIFY_API_VERSION: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .default("2026-10"),
    STRIPE_SECRET_KEY: z.string().optional(),
  })
  .parse(process.env);
