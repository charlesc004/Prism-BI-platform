import { test as base, expect } from "@playwright/test";

export { expect };

// Browser contexts share one server/IP. Respect the real limiter between large journeys.
export const test = base.extend<{ rateBudget: void }>({
  rateBudget: [
    async ({ request }, use, testInfo) => {
      const response = await request.get("/api/v1/openapi.json");
      const remaining = Number(response.headers()["ratelimit-remaining"]);
      if (!Number.isNaN(remaining) && remaining < 100) {
        const reset = Number(response.headers()["ratelimit-reset"]);
        const wait = (Math.min(60, Math.max(1, reset || 60)) + 1) * 1000;
        testInfo.setTimeout(testInfo.timeout + wait);
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
      await use();
    },
    { auto: true },
  ],
});
