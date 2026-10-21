import {
  Component,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
} from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import type {
  SavedReport,
  AnalyticsResult,
  Metric,
  ReportDefinition,
} from "@prism/contracts";
import { metrics } from "@prism/contracts";
import { Api } from "../../core/services/api.service";
import { Auth } from "../../core/auth/auth.service";
import { ChartComponent } from "../../shared/charts/chart.component";
import { Icon } from "../../shared/ui/icon";
import { defaultRange } from "../../shared/components/date-range";
@Component({
  imports: [ReactiveFormsModule, ChartComponent, Icon],
  templateUrl: "./reports.page.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsPage {
  api = inject(Api);
  auth = inject(Auth);
  fb = inject(FormBuilder);
  reports = signal<SavedReport[]>([]);
  selected = signal("");
  preview = signal<AnalyticsResult | null>(null);
  previewMetric = signal<Metric>("revenue");
  error = signal("");
  busy = signal(false);
  metricList = Object.entries(metrics).map(([key, value]) => ({
    key,
    ...value,
  }));
  form = this.fb.nonNullable.group({
    name: ["Untitled report", [Validators.required, Validators.maxLength(100)]],
    metric: ["revenue" as Metric, Validators.required],
    group: ["month" as "day" | "week" | "month"],
    from: [defaultRange(90).from, Validators.required],
    to: [defaultRange().to, Validators.required],
    sourceId: [""],
  });
  labels = computed(() => this.preview()?.trends.map((t) => t.date) || []);
  series = computed(() => [
    {
      label: metrics[this.previewMetric()].label,
      data:
        this.preview()?.trends.map((t) =>
          t[this.previewMetric()] === null
            ? null
            : t[this.previewMetric()]! /
              (metrics[this.previewMetric()].unit === "currency" ? 100 : 1),
        ) || [],
      color: "#2c7658",
    },
  ]);
  sources = signal<{ id: string; name: string }[]>([]);
  private previewRequest = 0;
  constructor() {
    void this.load();
    void this.api
      .get<{ id: string; name: string }[]>("/data-sources")
      .then((s) => this.sources.set(s))
      .catch((error) => this.error.set(this.api.message(error)));
  }
  async load() {
    try {
      this.reports.set(await this.api.get("/reports"));
    } catch (e) {
      this.error.set(this.api.message(e));
    }
  }
  definition(): ReportDefinition {
    const raw = this.form.getRawValue();
    return { ...raw, sourceId: raw.sourceId || undefined };
  }
  select(report: SavedReport) {
    this.selected.set(report.id);
    this.form.patchValue({ ...report, sourceId: report.sourceId || "" });
    this.form.markAsPristine();
    void this.showPreview();
  }
  create() {
    this.previewRequest++;
    this.busy.set(false);
    this.error.set("");
    this.selected.set("");
    this.preview.set(null);
    this.form.reset({
      name: "Untitled report",
      metric: "revenue",
      group: "month",
      from: defaultRange(90).from,
      to: defaultRange().to,
      sourceId: "",
    });
  }
  async showPreview() {
    const request = ++this.previewRequest;
    const definition = this.definition();
    this.busy.set(true);
    this.error.set("");
    try {
      const data =
        this.auth.user()?.role === "VIEWER"
          ? await this.api.post<AnalyticsResult>(
              "/reports/" + this.selected() + "/preview",
            )
          : await this.api.post<AnalyticsResult>("/report-preview", definition);
      if (request !== this.previewRequest) return;
      this.previewMetric.set(definition.metric);
      this.preview.set(data);
    } catch (e) {
      if (request === this.previewRequest) this.error.set(this.api.message(e));
    } finally {
      if (request === this.previewRequest) this.busy.set(false);
    }
  }
  async save() {
    this.busy.set(true);
    this.error.set("");
    try {
      const report = await (this.selected()
        ? this.api.patch<SavedReport>(
            "/reports/" + this.selected(),
            this.definition(),
          )
        : this.api.post<SavedReport>("/reports", this.definition()));
      this.selected.set(report.id);
      this.form.markAsPristine();
      await this.load();
      this.api.notice.set("Report saved.");
      await this.showPreview();
    } catch (e) {
      this.error.set(this.api.message(e));
    } finally {
      this.busy.set(false);
    }
  }
  async remove() {
    this.busy.set(true);
    try {
      await this.api.delete("/reports/" + this.selected());
      this.create();
      await this.load();
    } catch (e) {
      this.error.set(this.api.message(e));
    } finally {
      this.busy.set(false);
    }
  }
  export() {
    void this.api.download(
      "/reports/" + this.selected() + "/export",
      "prism-report.csv",
    );
  }
  metricDescription() {
    return metrics[this.form.getRawValue().metric].definition;
  }
}
