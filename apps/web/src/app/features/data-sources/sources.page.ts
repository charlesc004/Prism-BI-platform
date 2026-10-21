import { A11yModule } from "@angular/cdk/a11y";
import {
  Component,
  inject,
  signal,
  DestroyRef,
  ChangeDetectionStrategy,
} from "@angular/core";
import { DatePipe, DecimalPipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import type { Source } from "@prism/contracts";
import { Api } from "../../core/services/api.service";
import { Auth } from "../../core/auth/auth.service";
import { Icon } from "../../shared/ui/icon";
import { StatusBadge } from "../../shared/components/status-badge";
interface ImportBatch {
  id: string;
  filename: string;
  status: string;
  imported: number;
  rejected: number;
  createdAt: string;
  errors: { row: number; message: string }[];
}
@Component({
  imports: [
    A11yModule,
    DatePipe,
    DecimalPipe,
    FormsModule,
    RouterLink,
    Icon,
    StatusBadge,
  ],
  templateUrl: "./sources.page.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SourcesPage {
  api = inject(Api);
  auth = inject(Auth);
  sources = signal<Source[]>([]);
  imports = signal<ImportBatch[]>([]);
  detail = signal<Source | null>(null);
  error = signal("");
  busy = signal("");
  uploading = signal(false);
  currentSchedule = signal("off");
  scheduleBusy = signal(false);
  private destroy = inject(DestroyRef);
  constructor() {
    void this.load();
    const timer = setInterval(() => void this.load(false), 4000);
    this.destroy.onDestroy(() => clearInterval(timer));
  }
  async load(showError = true) {
    try {
      const [sources, imports] = await Promise.all([
        this.api.get<Source[]>("/data-sources"),
        this.api.get<ImportBatch[]>("/imports"),
      ]);
      this.sources.set(sources);
      this.imports.set(imports);
      if (this.detail())
        this.detail.set(
          sources.find((s) => s.id === this.detail()?.id) || null,
        );
    } catch (e) {
      if (showError) this.error.set(this.api.message(e));
    }
  }
  async openDetail(source: Source) {
    this.detail.set(source);
    if (
      this.auth.user()?.role !== "ADMIN" ||
      source.status === "NOT_CONFIGURED" ||
      (source.provider === "CSV" && source.mode === "LIVE")
    )
      return;
    this.scheduleBusy.set(true);
    try {
      const result = await this.api.get<{ schedule: string }>(
        "/data-sources/" + source.id + "/schedule",
      );
      if (this.detail()?.id === source.id)
        this.currentSchedule.set(result.schedule);
    } catch (error) {
      this.error.set(this.api.message(error));
    } finally {
      this.scheduleBusy.set(false);
    }
  }
  async sync(source: Source) {
    this.busy.set(source.id);
    this.error.set("");
    try {
      await this.api.post("/data-sources/" + source.id + "/sync");
      await this.load();
      this.api.notice.set(
        "Synchronization queued. Follow its progress in Synchronization.",
      );
    } catch (e) {
      this.error.set(this.api.message(e));
    } finally {
      this.busy.set("");
    }
  }
  async upload(event: Event) {
    const input = event.target as HTMLInputElement,
      file = input.files?.[0];
    if (!file) return;
    this.uploading.set(true);
    this.error.set("");
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await this.api.post<{ duplicate?: boolean }>(
        "/imports/csv",
        form,
      );
      this.api.notice.set(
        result.duplicate
          ? "This file has already been imported."
          : "Import queued. Results will appear below.",
      );
      await this.load();
    } catch (e) {
      this.error.set(this.api.message(e));
    } finally {
      input.value = "";
      this.uploading.set(false);
    }
  }
  async schedule(id: string, value: string) {
    this.scheduleBusy.set(true);
    try {
      await this.api.patch("/data-sources/" + id + "/schedule", {
        schedule: value,
      });
      this.api.notice.set("Synchronization schedule updated.");
      this.currentSchedule.set(value);
    } catch (e) {
      this.error.set(this.api.message(e));
    } finally {
      this.scheduleBusy.set(false);
    }
  }
}
