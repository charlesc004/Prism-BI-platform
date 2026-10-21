import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

test("account roles explain their permissions and the shared logo renders on desktop and mobile", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page.locator(".brand-symbol")).toHaveAttribute(
    "src",
    "/brand-mark.svg",
  );
  for (const [role, description] of [
    ["admin", "Full access"],
    ["analyst", "Analysis access"],
    ["viewer", "Read-only access"],
  ]) {
    await page.getByRole("button", { name: role, exact: true }).click();
    await expect(
      page.getByRole("button", { name: role, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".role-description")).toContainText(description);
    await expect(page.getByLabel("Email address", { exact: true })).toHaveValue(
      `${role}@prism.local`,
    );
  }
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator(".login-story .brand")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Login must fit at ${width}px`,
    ).toBe(true);
  }
});

async function login(page: Page, role = "admin") {
  await page.goto("/login");
  await page.getByRole("button", { name: role, exact: true }).click();
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await expect(page.locator(".metric-value").first()).toBeVisible();
}

for (const width of [320, 768, 1440]) {
  test(`all pages remain readable and fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await login(page);
    for (const route of [
      "overview",
      "analytics",
      "data-sources",
      "synchronization",
      "data-explorer",
      "reports",
      "settings",
    ]) {
      await page.goto("/" + route);
      await expect(page.locator("main h1")).toBeVisible();
      await expect(page.locator("main .error-box")).toHaveCount(0);
      const layout = await page.locator("main").evaluate((main) => {
        const smallText = [...main.querySelectorAll<HTMLElement>("*")].filter(
          (element) =>
            element.getClientRects().length &&
            [...element.childNodes].some(
              (node) =>
                node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
            ) &&
            parseFloat(getComputedStyle(element).fontSize) < 11,
        );
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          smallText: smallText.map((element) => element.textContent?.trim()),
        };
      });
      expect(layout, route).toEqual({ overflow: false, smallText: [] });
    }
    expect(errors).toEqual([]);
  });
}

for (const width of [390, 1440]) {
  test(`settings, schedules, sorting and report editing work at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    const initial = await (
      await page.request.get("/api/v1/settings/workspace")
    ).json();
    await page.goto("/settings");
    try {
      await page
        .getByLabel("Workspace name", { exact: true })
        .fill("Northstar Quality Review");
      await page
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await expect(page.locator(".workspace-switch strong")).toHaveText(
        "Northstar Quality Review",
      );
      await page.goto("/overview");
      await expect(page.locator(".live-context strong")).toHaveText(
        "Northstar Quality Review",
      );
    } finally {
      await page.goto("/settings");
      await expect(
        page.getByLabel("Workspace name", { exact: true }),
      ).toHaveValue("Northstar Quality Review");
      await page
        .getByLabel("Workspace name", { exact: true })
        .fill(initial.name);
      await page
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await expect(page.locator(".workspace-switch strong")).toHaveText(
        initial.name,
      );
    }
    await page.goto("/data-sources");
    const source = page
      .locator(".source-card")
      .filter({ hasText: "Shopify Store" });
    await source.getByRole("button", { name: "View details" }).click();
    const schedule = page.getByRole("combobox", {
      name: "Recurring synchronization",
    });
    await expect(schedule).toBeEnabled();
    const originalSchedule = await schedule.inputValue();
    await schedule.selectOption("daily");
    await expect(schedule).toBeEnabled();
    await page
      .getByRole("button", { name: "Close details", exact: true })
      .click();
    await source.getByRole("button", { name: "View details" }).click();
    await expect(schedule).toHaveValue("daily");
    await expect(schedule).toBeEnabled();
    await schedule.selectOption(originalSchedule);
    await expect(schedule).toBeEnabled();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.goto("/data-explorer");
    await expect(page.locator("tbody tr").first()).toContainText("NS-");
    await page.getByRole("button", { name: "Record ID" }).click();
    await expect(page.locator('th[aria-sort="ascending"]')).toContainText(
      "Record ID",
    );
    await page.locator("tbody tr").first().focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("dialog", { name: "Record details" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await page
      .getByRole("combobox", { name: "Dataset", exact: true })
      .selectOption("payments");
    await expect(page.locator("thead")).toContainText("Refunded");
    await page
      .getByRole("combobox", { name: "Dataset", exact: true })
      .selectOption("campaign-spend");
    await expect(page.locator("thead")).toContainText("Campaign");
    await page.goto("/reports");
    await page
      .getByLabel("Report name", { exact: true })
      .fill("Quality review report");
    await page
      .getByRole("button", { name: "Save report", exact: true })
      .click();
    await expect(
      page
        .locator(".saved-report")
        .filter({ hasText: "Quality review report" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save report", exact: true }),
    ).toBeEnabled();
    await page
      .getByLabel("Report name", { exact: true })
      .fill("Updated quality review");
    await expect(
      page.getByRole("button", { name: "Export CSV", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Save report", exact: true })
      .click();
    await expect(
      page
        .locator(".saved-report")
        .filter({ hasText: "Updated quality review" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Export CSV", exact: true }),
    ).toBeEnabled();
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV", exact: true }).click();
    expect((await downloaded).suggestedFilename()).toBe("prism-report.csv");
    await page
      .getByRole("button", { name: "Delete report", exact: true })
      .click();
    await expect(
      page
        .locator(".saved-report")
        .filter({ hasText: "Updated quality review" }),
    ).toHaveCount(0);
  });
}

test("a slow analytics response cannot replace a newer reporting filter", async ({
  page,
}) => {
  await login(page);
  let count = 0;
  await page.route("**/api/v1/analytics/revenue?*", async (route) => {
    const response = await route.fetch();
    if (++count === 1) await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({ response });
  });
  await page.goto("/analytics");
  await page
    .getByRole("combobox", { name: "Reporting period" })
    .selectOption("7");
  await expect(page.locator("canvas")).toHaveCount(6);
  await page
    .getByRole("combobox", { name: "Group by", exact: true })
    .selectOption("month");
  await expect(
    page.getByRole("combobox", { name: "Reporting period" }),
  ).toHaveValue("7");
  await expect(page.locator("main .error-box")).toHaveCount(0);
});

test("analysts can report and export while administrative controls stay read-only", async ({
  page,
}) => {
  await login(page, "analyst");
  await page.goto("/data-sources");
  await expect(
    page.getByRole("button", { name: "Sync now", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("input[type=file]")).toHaveCount(1);
  await page.goto("/settings");
  await expect(
    page.getByLabel("Workspace name", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "Workspace team", exact: true }),
  ).toHaveCount(0);
  await page.goto("/reports");
  await expect(
    page.getByRole("button", { name: "New report", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Report name", { exact: true })
    .fill("Analyst quality report");
  await page.getByRole("button", { name: "Save report", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Export CSV", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Delete report", exact: true })
    .click();
  await expect(
    page.locator(".saved-report").filter({ hasText: "Analyst quality report" }),
  ).toHaveCount(0);
});

test("API errors can be retried and expired access cookies refresh the session", async ({
  page,
  context,
}) => {
  await login(page);
  const cookies = await context.cookies();
  await context.clearCookies({ name: "prism_access" });
  await page.goto("/overview");
  await expect(page.locator(".metric-value").first()).toBeVisible();
  const refreshed = await context.cookies();
  expect(
    refreshed.find((cookie) => cookie.name === "prism_access")?.value,
  ).not.toBe(cookies.find((cookie) => cookie.name === "prism_access")?.value);
  let fail = true;
  await page.route("**/api/v1/analytics/revenue?*", async (route) => {
    if (fail) {
      fail = false;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: { message: "Temporary service outage" },
        }),
      });
    } else await route.continue();
  });
  await page.goto("/analytics");
  await expect(page.getByRole("alert")).toContainText(
    "Temporary service outage",
  );
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.locator("canvas")).toHaveCount(6);
  await expect(page.getByRole("alert")).toHaveCount(0);
});
