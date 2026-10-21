import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { StripeProvider, ShopifyProvider } from "../src/providers/live.js";
const stripe = JSON.parse(
  readFileSync(
    new URL("../../../fixtures/stripe/charges-page.json", import.meta.url),
    "utf8",
  ),
) as {
  data: { id: string; currency: string; amount_refunded: number }[];
  has_more: boolean;
};
const shopify = JSON.parse(
  readFileSync(
    new URL("../../../fixtures/shopify/orders-page.json", import.meta.url),
    "utf8",
  ),
) as {
  data: {
    orders: {
      nodes: unknown[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
};
const response = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
describe("Stripe HTTP adapter", () => {
  it("maps integer amounts, refunds and cursor pagination", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(stripe))
      .mockResolvedValueOnce(
        response({
          data: [{ ...stripe.data[0], amount_refunded: 5000 }],
          has_more: false,
        }),
      );
    const provider = new StripeProvider(transport, {
      key: "sk_test_fixture",
    });
    const first = await provider.fetchPage({});
    expect(first.records[0]).toMatchObject({
      kind: "payment",
      amount: 14950,
      refund: 2500,
      currency: "USD",
    });
    expect(first.nextCursor).toBe("ch_fixture_001");
    const second = await provider.fetchPage({ cursor: first.nextCursor });
    expect(String(transport.mock.calls[1][0])).toContain(
      "starting_after=ch_fixture_001",
    );
    expect(second.records[0]).toMatchObject({ refund: 5000 });
  });
  it("honors bounded rate-limit retries and rejects incomplete responses", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("", { status: 429, headers: { "retry-after": "0" } }),
      )
      .mockResolvedValueOnce(response({ data: [], has_more: true }));
    await expect(
      new StripeProvider(transport, { key: "sk_test_fixture" }).fetchPage({}),
    ).rejects.toThrow("incomplete page");
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it("rejects non-USD records and protects real accounts during tests", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        data: [{ ...stripe.data[0], currency: "eur" }],
        has_more: false,
      }),
    );
    await expect(
      new StripeProvider(transport, { key: "sk_test_fixture" }).fetchPage({}),
    ).rejects.toThrow();
    await expect(new StripeProvider().fetchPage({})).rejects.toThrow(
      "requires",
    );
    await expect(
      new StripeProvider(transport, { key: "sk_live_disabled" }).fetchPage({}),
    ).rejects.toThrow("requires");
  });
});
describe("Shopify GraphQL adapter", () => {
  it("maps discounted totals and refunds with incremental updated-at filtering", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response(shopify));
    const provider = new ShopifyProvider(transport, {
      domain: "fixture.myshopify.com",
      token: "fixture-token",
      version: "2026-10",
    });
    const page = await provider.fetchPage({
      cursor: "previous",
      since: "2026-10-18T00:00:00Z",
    });
    expect(page.records[0]).toMatchObject({
      kind: "order",
      gross: 15950,
      discount: 1000,
      refund: 2500,
      status: "PAID",
    });
    expect(page.nextCursor).toBe("fixture-cursor-001");
    expect(page.checkpoint).toBe("2026-10-20T10:00:00Z");
    const body = JSON.parse(String(transport.mock.calls[0][1]?.body)) as {
      variables: { after: string; search: string };
    };
    expect(body.variables.after).toBe("previous");
    expect(body.variables.search).toContain("updated_at:>=");
  });
  it("rejects GraphQL errors, missing cursors and external failures", async () => {
    for (const body of [
      { errors: [{ message: "fixture failure" }] },
      {
        data: {
          orders: {
            nodes: [],
            pageInfo: { hasNextPage: true, endCursor: null },
          },
        },
      },
    ]) {
      const provider = new ShopifyProvider(
        vi.fn<typeof fetch>().mockResolvedValue(response(body)),
        {
          domain: "fixture.myshopify.com",
          token: "fixture",
          version: "2026-10",
        },
      );
      await expect(provider.fetchPage({})).rejects.toThrow();
    }
    const provider = new ShopifyProvider(
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response("private response must stay hidden", { status: 503 }),
        ),
      {
        domain: "fixture.myshopify.com",
        token: "fixture",
        version: "2026-10",
      },
    );
    await expect(provider.fetchPage({})).rejects.toThrow("HTTP 503");
  });
});
