import { test, expect } from "./fixtures";
import { resolve } from "node:path";
test("admin completes the persisted workspace journey", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Overview", level: 1 }),
  ).toBeVisible();
  await expect(page.locator(".metric-value").first()).not.toContainText("—");
  await page
    .getByRole("link", { name: "Data Sources", exact: false })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Data sources", exact: false }).first(),
  ).toBeVisible();
  const source = page
    .locator(".source-card")
    .filter({ hasText: "Shopify Store" });
  const synchronization = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith("/sync"),
  );
  await source.getByRole("button", { name: "Sync now" }).click();
  expect((await synchronization).status()).toBe(202);
  await page
    .getByRole("link", { name: "Synchronization", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /^Synchronization/, level: 1 }),
  ).toBeVisible();
  await expect(page.locator("tbody tr").first().locator(".badge")).toHaveText(
    "completed",
    { timeout: 30000 },
  );
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page.locator(".metric-value").first()).not.toContainText("—");
  await page
    .getByRole("link", { name: "Data Sources", exact: false })
    .first()
    .click();
  await page
    .locator("input[type=file]")
    .setInputFiles(resolve("fixtures/campaign-spend/valid.csv"));
  await expect(
    page.locator(".import-row").filter({ hasText: "valid.csv" }),
  ).toContainText(/completed|already/i, { timeout: 30000 });
  await page
    .locator("input[type=file]")
    .setInputFiles(resolve("fixtures/campaign-spend/invalid.csv"));
  await expect(
    page.getByRole("alert").filter({ hasText: "No valid rows" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Data Explorer", exact: true }).click();
  await page.getByRole("textbox", { name: "Search records" }).fill("NS-");
  await expect(page.locator("tbody tr").first()).toContainText("NS-");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator(".pagination")).toContainText("page 2");
  await page.getByRole("link", { name: "Reports", exact: true }).click();
  await page.getByRole("button", { name: "New report" }).click();
  await page
    .getByLabel("Report name", { exact: true })
    .fill("E2E revenue report");
  await page.getByRole("button", { name: "Save report", exact: true }).click();
  await expect(
    page.locator(".saved-report").filter({ hasText: "E2E revenue report" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Report preview", exact: true }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("prism-report.csv");
  await page
    .getByRole("button", { name: "Delete report", exact: true })
    .click();
  await expect(
    page.locator(".saved-report").filter({ hasText: "E2E revenue report" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign in to workspace" }),
  ).toBeVisible();
});
test("viewer sees analytics and cannot administer or export", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "viewer", exact: true }).click();
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Overview", level: 1 }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Data Sources", exact: false })
    .first()
    .click();
  await expect(page.getByRole("button", { name: "Sync now" })).toHaveCount(0);
  await expect(page.locator("input[type=file]")).toHaveCount(0);
  await page.getByRole("link", { name: "Reports", exact: true }).click();
  await expect(page.getByRole("button", { name: "New report" })).toHaveCount(0);
  const response = await page.request.post("/api/v1/data-sources/invalid/sync");
  expect(response.status()).toBe(403);
});
test("mobile navigation and dashboard fit the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Overview", level: 1 }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("link", { name: "Data Explorer", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Data Explorer", level: 1 }),
  ).toBeVisible();
});
