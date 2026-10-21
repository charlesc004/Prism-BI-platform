import {
  Component,
  inject,
  signal,
  DestroyRef,
  ChangeDetectionStrategy,
} from "@angular/core";
import { DatePipe, DecimalPipe } from "@angular/common";
import type { SyncRun } from "@prism/contracts";
import { Api } from "../../core/services/api.service";
import { StatusBadge } from "../../shared/components/status-badge";
import { Icon } from "../../shared/ui/icon";
@Component({
  imports: [DatePipe, DecimalPipe, StatusBadge, Icon],
  template: `<div class="page-heading">
      <div>
        <div class="eyebrow">EVERY CONNECTION, ACCOUNTED FOR</div>
        <h1>Synchronization<span class="heading-dot">.</span></h1>
        <p>Follow your background jobs from queue to completion.</p>
      </div>
      <button class="btn" (click)="load()">
        <prism-icon name="sync" />Refresh
      </button>
    </div>
    <div class="operations-grid">
      @for (item of ["api", "database", "redis", "worker"]; track item) {
        <div class="panel operation">
          <span>{{ item === "redis" ? "Redis / queue" : item }}</span
          ><prism-status [value]="operations()[item] ? 'READY' : 'ERROR'" />
        </div>
      }
    </div>
    @if (error()) {
      <div class="error-box" role="alert">{{ error() }}</div>
    }
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Synchronization history</h2>
          <p>Auto-refreshes every 3 seconds · latest 100 runs</p>
        </div>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Source</th>
              <th>Status</th>
              <th>Started</th>
              <th>Processed</th>
              <th>Created / updated</th>
              <th>Attempt</th>
            </tr>
          </thead>
          <tbody>
            @for (run of runs(); track run.id) {
              <tr>
                <td>
                  <strong>{{ run.source?.name }}</strong>
                  @if (run.error) {
                    <details>
                      <summary>View error</summary>
                      <p class="error-text">{{ run.error }}</p>
                    </details>
                  }
                </td>
                <td><prism-status [value]="run.status" /></td>
                <td>{{ run.queuedAt | date: "MMM d, y, h:mm a" }}</td>
                <td>{{ run.processed | number }}</td>
                <td>{{ run.created | number }} / {{ run.updated | number }}</td>
                <td>{{ run.attempt }} / 3</td>
              </tr>
            } @empty {
              <tr>
                <td colspan="6">
                  <div class="empty-state">No synchronization jobs yet.</div>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SyncPage {
  api = inject(Api);
  runs = signal<SyncRun[]>([]);
  operations = signal<Record<string, boolean>>({});
  error = signal("");
  destroy = inject(DestroyRef);
  constructor() {
    void this.load();
    const timer = setInterval(() => void this.load(), 3000);
    this.destroy.onDestroy(() => clearInterval(timer));
  }
  async load() {
    try {
      const [runs, operations] = await Promise.all([
        this.api.get<SyncRun[]>("/sync-runs"),
        this.api.get<Record<string, boolean>>("/operations"),
      ]);
      this.runs.set(runs);
      this.operations.set(operations);
      this.error.set("");
    } catch (e) {
      this.error.set(this.api.message(e));
    }
  }
}
