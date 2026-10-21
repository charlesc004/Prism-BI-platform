import { z } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../shared/errors.js";
import {
  minorUnits,
  type DataProvider,
  type ProviderPage,
} from "./contracts.js";

async function providerFetch(
  url: string,
  init: RequestInit,
  transport: typeof fetch,
  attempt = 0,
): Promise<unknown> {
  const response = await transport(url, {
    ...init,
    signal: AbortSignal.timeout(20000),
  });
  if (response.status === 429 && attempt < 2) {
    const delay = Math.min(
      5000,
      Math.max(0, Number(response.headers.get("retry-after") || 1) * 1000),
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
    return providerFetch(url, init, transport, attempt + 1);
  }
  if (!response.ok)
    throw new AppError(
      response.status === 429 ? 429 : 502,
      `Provider returned HTTP ${response.status}; credentials and response bodies are omitted.`,
    );
  return response.json() as Promise<unknown>;
}
const chargeSchema = z.object({
  id: z.string(),
  created: z.number(),
  currency: z.literal("usd"),
  amount: z.number().int(),
  amount_refunded: z.number().int(),
  status: z.enum(["succeeded", "pending", "failed"]),
});
export class StripeProvider implements DataProvider {
  constructor(
    private transport: typeof fetch = fetch,
    private settings: { key?: string } = { key: env.STRIPE_SECRET_KEY },
  ) {}
  async fetchPage({
    cursor,
    since,
  }: {
    cursor?: string;
    since?: string;
  }): Promise<ProviderPage> {
    if (
      (env.NODE_ENV === "test" && this.transport === fetch) ||
      !this.settings.key?.startsWith("sk_test_")
    )
      throw new AppError(
        409,
        "Stripe requires a server-side sk_test_ key. Live-money accounts are disabled.",
      );
    const params = new URLSearchParams({ limit: "100" });
    if (cursor) params.set("starting_after", cursor);
    // Reconcile all charges: creation-time watermarks cannot discover later refunds reliably.
    const data = z
      .object({ data: z.array(chargeSchema), has_more: z.boolean() })
      .parse(
        await providerFetch(
          `https://api.stripe.com/v1/charges?${params}`,
          {
            headers: { Authorization: `Bearer ${this.settings.key}` },
          },
          this.transport,
        ),
      );
    if (data.has_more && !data.data.length)
      throw new AppError(502, "Stripe returned an incomplete page");
    return {
      records: data.data.map((c) => ({
        kind: "payment" as const,
        externalId: c.id,
        occurredAt: new Date(c.created * 1000),
        currency: "USD",
        amount: c.amount,
        refund: c.amount_refunded,
        status: c.status.toUpperCase() as "SUCCEEDED" | "PENDING" | "FAILED",
      })),
      nextCursor: data.has_more ? data.data.at(-1)?.id : undefined,
      checkpoint: since || new Date().toISOString(),
    };
  }
}
const amount = z.object({
  shopMoney: z.object({ amount: z.string(), currencyCode: z.literal("USD") }),
});
const order = z.object({
  id: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  cancelledAt: z.string().nullable(),
  displayFinancialStatus: z.string(),
  totalPriceSet: amount,
  totalDiscountsSet: amount,
  totalRefundedSet: amount,
});
export class ShopifyProvider implements DataProvider {
  constructor(
    private transport: typeof fetch = fetch,
    private settings: { domain?: string; token?: string; version: string } = {
      domain: env.SHOPIFY_DOMAIN,
      token: env.SHOPIFY_TOKEN,
      version: env.SHOPIFY_API_VERSION,
    },
  ) {}
  async fetchPage({
    cursor,
    since,
  }: {
    cursor?: string;
    since?: string;
  }): Promise<ProviderPage> {
    if (
      (env.NODE_ENV === "test" && this.transport === fetch) ||
      !this.settings.domain ||
      !this.settings.token
    )
      throw new AppError(409, "Shopify is not configured on the server.");
    const query = `query Orders($after:String,$search:String) { orders(first:100,after:$after,sortKey:UPDATED_AT,query:$search) { nodes { id createdAt updatedAt cancelledAt displayFinancialStatus totalPriceSet { shopMoney { amount currencyCode } } totalDiscountsSet { shopMoney { amount currencyCode } } totalRefundedSet { shopMoney { amount currencyCode } } } pageInfo { hasNextPage endCursor } } }`;
    const raw = await providerFetch(
      `https://${this.settings.domain}/admin/api/${this.settings.version}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": this.settings.token,
        },
        body: JSON.stringify({
          query,
          variables: {
            after: cursor,
            search: since ? `updated_at:>=${since}` : undefined,
          },
        }),
      },
      this.transport,
    );
    const result = z
      .object({
        data: z
          .object({
            orders: z.object({
              nodes: z.array(order),
              pageInfo: z.object({
                hasNextPage: z.boolean(),
                endCursor: z.string().nullable(),
              }),
            }),
          })
          .optional(),
        errors: z.array(z.unknown()).optional(),
      })
      .parse(raw);
    if (result.errors?.length || !result.data)
      throw new AppError(
        502,
        "Shopify GraphQL query failed; check permissions and API version.",
      );
    const page = result.data.orders;
    if (page.pageInfo.hasNextPage && !page.pageInfo.endCursor)
      throw new AppError(502, "Shopify returned an incomplete cursor");
    return {
      records: page.nodes.map((o) => ({
        kind: "order",
        externalId: o.id,
        occurredAt: new Date(o.createdAt),
        currency: "USD",
        gross:
          minorUnits(o.totalPriceSet.shopMoney.amount) +
          minorUnits(o.totalDiscountsSet.shopMoney.amount),
        discount: minorUnits(o.totalDiscountsSet.shopMoney.amount),
        refund: minorUnits(o.totalRefundedSet.shopMoney.amount),
        status: o.cancelledAt
          ? "CANCELLED"
          : ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"].includes(
                o.displayFinancialStatus,
              )
            ? "PAID"
            : "PENDING",
      })),
      nextCursor: page.pageInfo.hasNextPage
        ? page.pageInfo.endCursor!
        : undefined,
      checkpoint: page.nodes.at(-1)?.updatedAt || since,
    };
  }
}
