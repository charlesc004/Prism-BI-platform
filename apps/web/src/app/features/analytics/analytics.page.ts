import {
  Component,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import type { AnalyticsResult } from "@prism/contracts";
import { Api } from "../../core/services/api.service";
import { ChartComponent } from "../../shared/charts/chart.component";
import {
  DateRangeFilter,
  defaultRange,
  type DateRange,
} from "../../shared/components/date-range";
@Component({
  imports: [FormsModule, ChartComponent, DateRangeFilter],
  template: `<div class="page-heading">
      <div>
        <div class="eyebrow">LOOK A LITTLE DEEPER</div>
        <h1>Analytics<span class="heading-dot">.</span></h1>
        <p>Understand the trends behind your business.</p>
      </div>
      <prism-date-range [range]="range()" (changed)="change($event)" />
    </div>
    <div class="filter-bar">
      <label
        >Group by
        <select [ngModel]="range().group" (ngModelChange)="group($event)">
          <option value="day">Day</option>
          <option value="week">Week</option>
          <option value="month">Month</option>
        </select></label
      ><span class="muted"
        >USD · {{ data()?.period?.timezone }} ·
        {{ data()?.period?.canonical }} revenue</span
      >
    </div>
    @if (error()) {
      <div class="error-box" role="alert">
        {{ error() }}<button (click)="load()">Retry</button>
      </div>
    }
    @if (data()) {
      @for (warning of data()!.warnings; track warning) {
        <div class="info-banner" role="status">{{ warning }}</div>
      }
      <div class="analytics-grid">
        @for (chart of charts; track chart.key) {
          <section class="panel">
            <div class="panel-header">
              <div>
                <h2>{{ chart.title }}</h2>
                <p>{{ chart.description }}</p>
              </div>
            </div>
            <prism-chart
              [labels]="labels()"
              [series]="series(chart.key, chart.color)"
              [currency]="chart.key !== 'orders'"
              [label]="chart.title"
            />
          </section>
        }
        <section class="panel">
          <div class="panel-header">
            <div>
              <h2>Revenue vs. marketing spend</h2>
              <p>Blended comparison, without attribution · USD</p>
            </div>
          </div>
          <prism-chart
            [labels]="labels()"
            [series]="comparison()"
            label="Revenue versus marketing spend in USD"
          />
        </section>
      </div>
    } @else if (!error()) {
      <div class="skeleton chart-skeleton"></div>
    }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyticsPage {
  api = inject(Api);
  range = signal(defaultRange());
  data = signal<AnalyticsResult | null>(null);
  error = signal("");
  charts: {
    key: "revenue" | "orders" | "refunds" | "payments" | "spend";
    title: string;
    description: string;
    color: string;
  }[] = [
    {
      key: "revenue",
      title: "Net revenue",
      description: "From your canonical revenue source · USD",
      color: "#2c7658",
    },
    {
      key: "orders",
      title: "Orders",
      description: "Paid, non-cancelled commerce orders",
      color: "#6a8e63",
    },
    {
      key: "payments",
      title: "Gross payments",
      description: "Successful Stripe payments, before refunds · USD",
      color: "#b3a357",
    },
    {
      key: "refunds",
      title: "Refunds",
      description: "Refunds by original event date · USD",
      color: "#c87c4e",
    },
    {
      key: "spend",
      title: "Campaign spend",
      description: "All imported marketing channels · USD",
      color: "#467d71",
    },
  ];
  labels = computed(() => this.data()?.trends.map((t) => t.date) || []);
  comparison = computed(() => [
    ...this.series("revenue", "#2c7658"),
    ...this.series("spend", "#d49657"),
  ]);
  private request = 0;
  constructor() {
    void this.load();
  }
  series(
    key: "revenue" | "orders" | "refunds" | "payments" | "spend",
    color: string,
  ) {
    return [
      {
        label: key,
        data:
          this.data()?.trends.map((t) =>
            t[key] === null ? null : t[key]! / (key === "orders" ? 1 : 100),
          ) || [],
        color,
      },
    ];
  }
  change(range: DateRange) {
    this.range.set(range);
    void this.load();
  }
  group(group: "day" | "week" | "month") {
    this.change({ ...this.range(), group });
  }
  async load() {
    const request = ++this.request;
    try {
      this.error.set("");
      const data = await this.api.get<AnalyticsResult>(
        "/analytics/revenue?" + new URLSearchParams({ ...this.range() }),
      );
      if (request === this.request) this.data.set(data);
    } catch (e) {
      if (request === this.request) this.error.set(this.api.message(e));
    }
  }
}
