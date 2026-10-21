import { A11yModule } from "@angular/cdk/a11y";
import {
  Component,
  inject,
  signal,
  DestroyRef,
  ChangeDetectionStrategy,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { JsonPipe } from "@angular/common";
import { Subject, debounceTime, distinctUntilChanged } from "rxjs";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import type { DataPage, Column, Source } from "@prism/contracts";
import { Api } from "../../core/services/api.service";
import { Auth } from "../../core/auth/auth.service";
import { DataTable } from "../../shared/components/data-table";
import {
  DateRangeFilter,
  defaultRange,
} from "../../shared/components/date-range";
import { Icon } from "../../shared/ui/icon";
const base: Column[] = [
  { key: "externalId", label: "Record ID" },
  { key: "occurredAt", label: "Event date", type: "date" },
  { key: "currency", label: "Currency" },
];
@Component({
  imports: [
    A11yModule,
    FormsModule,
    JsonPipe,
    DataTable,
    DateRangeFilter,
    Icon,
  ],
  template: `<div class="page-heading">
      <div>
        <div class="eyebrow">FROM INSIGHT TO DETAIL</div>
        <h1>Data Explorer<span class="heading-dot">.</span></h1>
        <p>Find the records behind your numbers.</p>
      </div>
      @if (auth.user()?.role !== "VIEWER") {
        <button class="btn" (click)="export()">
          <prism-icon name="download" />Export filtered CSV
        </button>
      }
    </div>
    <div class="filter-bar explorer-filters">
      <select
        aria-label="Dataset"
        [ngModel]="dataset()"
        (ngModelChange)="dataset.set($event); reset()"
      >
        <option value="orders">Commerce orders</option>
        <option value="payments">Payments</option>
        <option value="campaign-spend">Campaign spend</option>
      </select>
      <div class="search-field">
        <prism-icon name="search" /><input
          aria-label="Search records"
          placeholder="Search records…"
          [ngModel]="search()"
          (ngModelChange)="search.set($event); searchInput.next($event)"
        />
      </div>
      <select
        aria-label="Source filter"
        [ngModel]="source()"
        (ngModelChange)="source.set($event); reset()"
      >
        <option value="">All sources</option>
        @for (item of sources(); track item.id) {
          <option [value]="item.id">{{ item.name }} · {{ item.mode }}</option>
        }</select
      ><prism-date-range
        [range]="range()"
        (changed)="range.set($event); reset()"
      />
    </div>
    @if (error()) {
      <div class="error-box" role="alert">
        {{ error() }}<button (click)="load()">Retry</button>
      </div>
    }
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>
            {{
              dataset() === "orders"
                ? "Commerce orders"
                : dataset() === "payments"
                  ? "Payments"
                  : "Campaign spend"
            }}
          </h2>
          <p>
            {{ data().total }} records · server-side filters · click a row for
            details
          </p>
        </div>
        @if (loading()) {
          <span class="muted">Loading…</span>
        }
      </div>
      <prism-table
        [columns]="columns()"
        [rows]="data().data"
        [sortKey]="sortKey()"
        [direction]="direction()"
        (sort)="sort($event)"
        (selected)="detail.set($event)"
      />
      <div class="pagination">
        <span>{{ data().total }} records · page {{ page() }}</span>
        <div>
          <button
            class="btn"
            [disabled]="page() === 1 || loading()"
            (click)="page.set(page() - 1); load()"
          >
            Previous</button
          ><button
            class="btn"
            [disabled]="page() * 20 >= data().total || loading()"
            (click)="page.set(page() + 1); load()"
          >
            Next
          </button>
        </div>
      </div>
    </section>
    <p class="data-note">
      Monetary values are USD. Record details show integer cents; event
      timestamps are UTC. Source freshness is available in Data Sources.
    </p>
    @if (detail(); as row) {
      <div class="modal-backdrop" (click)="detail.set(null)">
        <section
          class="modal"
          cdkTrapFocus
          [cdkTrapFocusAutoCapture]="true"
          (keydown.escape)="detail.set(null)"
          role="dialog"
          aria-modal="true"
          aria-label="Record details"
          (click)="$event.stopPropagation()"
        >
          <div class="panel-header">
            <h2>Record details</h2>
            <button
              class="icon-button"
              (click)="detail.set(null)"
              aria-label="Close record details"
            >
              ×
            </button>
          </div>
          <pre class="record-json">{{ row | json }}</pre>
        </section>
      </div>
    }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExplorerPage {
  api = inject(Api);
  auth = inject(Auth);
  dataset = signal("orders");
  range = signal(defaultRange());
  search = signal("");
  source = signal("");
  sources = signal<Source[]>([]);
  page = signal(1);
  direction = signal("desc");
  sortKey = signal("occurredAt");
  data = signal<DataPage>({ data: [], total: 0, page: 1, pageSize: 20 });
  error = signal("");
  loading = signal(false);
  detail = signal<Record<string, unknown> | null>(null);
  searchInput = new Subject<string>();
  private request = 0;
  constructor() {
    this.searchInput
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => this.reset());
    void this.api
      .get<Source[]>("/data-sources")
      .then((s) => this.sources.set(s))
      .catch((error) => this.error.set(this.api.message(error)));
    void this.load();
    inject(DestroyRef).onDestroy(() => {
      this.request++;
    });
  }
  columns(): Column[] {
    return [
      ...base,
      ...(this.dataset() === "orders"
        ? [
            { key: "gross", label: "Gross sales", type: "currency" as const },
            { key: "discount", label: "Discounts", type: "currency" as const },
            { key: "refund", label: "Refunds", type: "currency" as const },
            { key: "status", label: "Status", type: "status" as const },
          ]
        : this.dataset() === "payments"
          ? [
              { key: "amount", label: "Amount", type: "currency" as const },
              { key: "refund", label: "Refunded", type: "currency" as const },
              { key: "status", label: "Status", type: "status" as const },
            ]
          : [
              { key: "campaign", label: "Campaign" },
              { key: "channel", label: "Channel" },
              { key: "spend", label: "Spend", type: "currency" as const },
              { key: "clicks", label: "Clicks", type: "number" as const },
            ]),
    ];
  }
  query() {
    return new URLSearchParams({
      ...this.range(),
      page: String(this.page()),
      search: this.search(),
      sort: this.sortKey(),
      direction: this.direction(),
      ...(this.source() ? { sourceId: this.source() } : {}),
    }).toString();
  }
  reset() {
    this.page.set(1);
    void this.load();
  }
  sort(key: string) {
    if (!["occurredAt", "externalId"].includes(key)) return;
    this.sortKey.set(key);
    this.direction.set(this.direction() === "desc" ? "asc" : "desc");
    this.reset();
  }
  async load() {
    const id = ++this.request;
    this.loading.set(true);
    try {
      const data = await this.api.get<DataPage>(
        "/data/" + this.dataset() + "?" + this.query(),
      );
      if (id === this.request) {
        this.data.set(data);
        this.error.set("");
      }
    } catch (e) {
      if (id === this.request) this.error.set(this.api.message(e));
    } finally {
      if (id === this.request) this.loading.set(false);
    }
  }
  export() {
    void this.api.download(
      "/data/" + this.dataset() + "/export?" + this.query(),
      "prism-" + this.dataset() + ".csv",
    );
  }
}
