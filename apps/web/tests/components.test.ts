import { describe, it, expect, vi, afterEach } from "vitest";
import { TestBed } from "@angular/core/testing";
import { MetricCard } from "../src/app/shared/components/metric-card";
import { DataTable } from "../src/app/shared/components/data-table";
import { DateRangeFilter } from "../src/app/shared/components/date-range";
import { AnalyticsPage } from "../src/app/features/analytics/analytics.page";
import { Api } from "../src/app/core/services/api.service";
import type { AnalyticsResult } from "@prism/contracts";

afterEach(() => TestBed.resetTestingModule());
describe("shared presentation behavior", () => {
  it("exposes the actual active sort direction to visual and assistive users", () => {
    const fixture = TestBed.createComponent(DataTable);
    fixture.componentRef.setInput("columns", [
      { key: "externalId", label: "Record ID" },
    ]);
    fixture.componentRef.setInput("rows", []);
    fixture.componentRef.setInput("sortKey", "externalId");
    fixture.componentRef.setInput("direction", "asc");
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector("th")?.getAttribute("aria-sort")).toBe(
      "ascending",
    );
    expect(element.querySelector("button span")?.textContent).toContain("↑");
    fixture.componentRef.setInput("direction", "desc");
    fixture.detectChanges();
    expect(element.querySelector("th")?.getAttribute("aria-sort")).toBe(
      "descending",
    );
  });
  it("ignores older analytics results after a newer filter completes", async () => {
    let resolveOld!: (value: AnalyticsResult) => void;
    let resolveNew!: (value: AnalyticsResult) => void;
    const old = new Promise<AnalyticsResult>(
      (resolve) => (resolveOld = resolve),
    );
    const newer = new Promise<AnalyticsResult>(
      (resolve) => (resolveNew = resolve),
    );
    const get = vi.fn().mockReturnValueOnce(old).mockReturnValueOnce(newer);
    TestBed.configureTestingModule({
      providers: [{ provide: Api, useValue: { get, message: () => "failed" } }],
    });
    const page = TestBed.runInInjectionContext(() => new AnalyticsPage());
    const latest = page.load();
    const missing = { value: null, previous: null, change: null };
    const result: AnalyticsResult = {
      trends: [],
      channels: [],
      summary: {
        revenue: missing,
        orders: missing,
        aov: missing,
        refunds: missing,
        spend: missing,
        ratio: missing,
      },
      period: {
        from: "2026-10-01",
        to: "2026-10-07",
        canonical: "SHOPIFY",
        timezone: "UTC",
      },
      currency: "USD",
      updatedAt: null,
      warnings: [],
    };
    resolveNew(result);
    await latest;
    resolveOld({ ...result, period: { ...result.period, from: "2026-09-01" } });
    await old;
    expect(page.data()).toBe(result);
  });
  it("distinguishes a missing metric from zero revenue and formats integer cents", () => {
    const fixture = TestBed.createComponent(MetricCard);
    fixture.componentRef.setInput("metric", "revenue");
    fixture.componentRef.setInput("data", {
      value: null,
      previous: null,
      change: null,
    });
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector(".metric-value")?.textContent).toContain("—");
    fixture.componentRef.setInput("data", {
      value: 12345,
      previous: 10000,
      change: 23.5,
    });
    fixture.detectChanges();
    expect(element.querySelector(".metric-value")?.textContent).toContain(
      "$123",
    );
    expect(element.querySelector(".change")?.textContent).toContain("23.5%");
    fixture.componentRef.setInput("data", {
      value: 0,
      previous: null,
      change: null,
    });
    fixture.detectChanges();
    expect(element.querySelector(".metric-value")?.textContent).toContain("$0");
  });
  it("renders source records, emits sorting and supports keyboard row details", () => {
    const fixture = TestBed.createComponent(DataTable),
      row = { id: "o1", externalId: "NS-001", amount: 12345 };
    fixture.componentRef.setInput("columns", [
      { key: "externalId", label: "Record" },
      { key: "amount", label: "Amount", type: "currency" },
    ]);
    fixture.componentRef.setInput("rows", [row]);
    let selected: unknown,
      sort = "";
    fixture.componentInstance.selected.subscribe((value) => (selected = value));
    fixture.componentInstance.sort.subscribe((value) => (sort = value));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain("$123.45");
    expect(element.querySelectorAll("thead button")).toHaveLength(1);
    element.querySelector<HTMLButtonElement>("thead button")?.click();
    expect(sort).toBe("externalId");
    element
      .querySelector("tbody tr")
      ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(selected).toEqual(row);
  });
  it("emits complete date filters and keeps custom ranges explicit", () => {
    const fixture = TestBed.createComponent(DateRangeFilter);
    let range: unknown;
    fixture.componentInstance.changed.subscribe((value) => (range = value));
    fixture.componentInstance.choose("7");
    expect(range).toMatchObject({ group: "day" });
    const previous = range;
    fixture.componentInstance.choose("custom");
    expect(range).toBe(previous);
    fixture.componentInstance.update("from", "2026-10-01");
    expect(range).toMatchObject({ from: "2026-10-01" });
  });
});
