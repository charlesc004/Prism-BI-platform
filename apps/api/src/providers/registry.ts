import { GeneratedProvider } from "./generated/provider.js";
import { ShopifyProvider, StripeProvider } from "./live.js";
import type { DataProvider } from "./contracts.js";
import { AppError } from "../shared/errors.js";
export function getProvider(source: {
  provider: string;
  mode: string;
}): DataProvider {
  if (source.mode === "GENERATED")
    return new GeneratedProvider(source.provider);
  if (source.provider === "SHOPIFY") return new ShopifyProvider();
  if (source.provider === "STRIPE") return new StripeProvider();
  throw new AppError(400, "CSV sources accept file uploads");
}
