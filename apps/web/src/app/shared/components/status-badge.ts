import { Component, input, ChangeDetectionStrategy } from "@angular/core";
@Component({
  selector: "prism-status",
  template: `<span class="badge" [class.bad]="bad()" [class.pending]="pending()"
    ><i></i>{{ label() }}</span
  >`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBadge {
  value = input("");
  bad() {
    return ["FAILED", "ERROR", "NOT_CONFIGURED", "CANCELLED"].includes(
      this.value(),
    );
  }
  pending() {
    return [
      "RUNNING",
      "QUEUED",
      "SYNCING",
      "RETRY_SCHEDULED",
      "PARTIAL",
    ].includes(this.value());
  }
  label() {
    return this.value().replaceAll("_", " ").toLowerCase();
  }
}
