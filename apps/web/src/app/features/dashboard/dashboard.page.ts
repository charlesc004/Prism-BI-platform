import {
  Component,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
} from "@angular/core";
import { DatePipe, DecimalPipe } from "@angular/common";
import { RouterLink } from "@angular/router";
import { FormsModule } from "@angular/forms";
import type {
  AnalyticsResult,
  Metric,
  Source,
  SyncRun,
} from "@prism/contracts";
import { Api } from "../../core/services/api.service";
import { Auth } from "../../core/auth/auth.service";
import { Workspace } from "../../core/services/workspace.service";
import { MetricCard } from "../../shared/components/metric-card";
import { ChartComponent } from "../../shared/charts/chart.component";
import {
  DateRangeFilter,
  defaultRange,
  type DateRange,
} from "../../shared/components/date-range";
import { StatusBadge } from "../../shared/components/status-badge";
import { Icon } from "../../shared/ui/icon";
@Component({
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    FormsModule,
    MetricCard,
    ChartComponent,
    DateRangeFilter,
    StatusBadge,
    Icon,
  ],
  templateUrl: "./dashboard.page.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPage {
  api = inject(Api);
  auth = inject(Auth);
  workspace = inject(Workspace);
  range = signal(defaultRange());
  data = signal<AnalyticsResult | null>(null);
  sources = signal<Source[]>([]);
  runs = signal<SyncRun[]>([]);
  loading = signal(true);
  error = signal("");
  active = signal<"revenue" | "orders" | "refunds">("revenue");
  cards: { metric: Metric; icon: string }[] = [
    { metric: "revenue", icon: "dollar" },
    { metric: "orders", icon: "bag" },
    { metric: "aov", icon: "chart" },
    { metric: "refunds", icon: "refund" },
    { metric: "spend", icon: "target" },
    { metric: "ratio", icon: "chart" },
  ];
  labels = computed(
    () =>
      this.data()?.trends.map((t) =>
        new Date(t.date + "T12:00:00").toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
      ) || [],
  );
  series = computed(() => [
    {
      label:
        this.active() === "revenue"
          ? "Net revenue"
          : this.active() === "orders"
            ? "Orders"
            : "Refunds",
      data:
        this.data()?.trends.map((t) =>
          t[this.active()] === null
            ? null
            : this.active() === "orders"
              ? t[this.active()]!
              : t[this.active()]! / 100,
        ) || [],
      color: "#2c7658",
    },
  ]);
  spendSeries = computed(() => [
    {
      label: "Spend",
      data: this.data()?.channels.map((c) => c.spend / 100) || [],
      color: "#d49657",
    },
  ]);
  channelLabels = computed(
    () => this.data()?.channels.map((c) => c.channel) || [],
  );
  totalRecords = computed(() =>
    this.sources().reduce(
      (n, s) => n + s._count.orders + s._count.payments + s._count.campaigns,
      0,
    ),
  );
  private request = 0;
  constructor() {
    void this.load();
  }
  async load() {
    const request = ++this.request;
    this.loading.set(true);
    this.error.set("");
    try {
      const [data, sources, runs] = await Promise.all([
        this.api.get<AnalyticsResult>(
          "/dashboard/summary?" + new URLSearchParams({ ...this.range() }),
        ),
        this.api.get<Source[]>("/data-sources"),
        this.api.get<SyncRun[]>("/sync-runs"),
      ]);
      if (request !== this.request) return;
      this.data.set(data);
      this.sources.set(sources);
      this.runs.set(runs.slice(0, 4));
    } catch (e) {
      if (request === this.request) this.error.set(this.api.message(e));
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }
  changeRange(value: DateRange) {
    this.range.set(value);
    void this.load();
  }
  export() {
    void this.api.download(
      "/data/orders/export?" + new URLSearchParams({ ...this.range() }),
      "prism-orders.csv",
    );
  }
}
