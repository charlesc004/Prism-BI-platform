import {
  Component,
  input,
  output,
  signal,
  ChangeDetectionStrategy,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Icon } from "../ui/icon";
export interface DateRange {
  from: string;
  to: string;
  group: "day" | "week" | "month";
}
export function defaultRange(days = 30): DateRange {
  const now = new Date(),
    end = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())),
    start = new Date(end.getTime() - (days - 1) * 86400000);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
    group: days > 90 ? "month" : "day",
  };
}
@Component({
  selector: "prism-date-range",
  imports: [FormsModule, Icon],
  template: `<div class="date-filter">
    <prism-icon name="calendar" /><select
      aria-label="Reporting period"
      [ngModel]="preset()"
      (ngModelChange)="choose($event)"
    >
      <option value="7">Last 7 days</option>
      <option value="30">Last 30 days</option>
      <option value="90">Last 90 days</option>
      <option value="month">This month</option>
      <option value="last">Last month</option>
      <option value="custom">Custom range</option>
    </select>
    @if (preset() === "custom") {
      <input
        aria-label="Start date"
        type="date"
        [ngModel]="range().from"
        (ngModelChange)="update('from', $event)"
      /><span>–</span
      ><input
        aria-label="End date"
        type="date"
        [ngModel]="range().to"
        (ngModelChange)="update('to', $event)"
      />
    }
  </div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DateRangeFilter {
  range = input<DateRange>(defaultRange());
  changed = output<DateRange>();
  preset = signal("30");
  choose(value: string) {
    this.preset.set(value);
    if (value === "custom") return;
    let range = defaultRange(Number(value) || 30);
    if (value === "month" || value === "last") {
      const now = new Date(),
        first = new Date(
          Date.UTC(
            now.getFullYear(),
            now.getMonth() - (value === "last" ? 1 : 0),
            1,
          ),
        ),
        last =
          value === "last"
            ? new Date(Date.UTC(now.getFullYear(), now.getMonth(), 0))
            : new Date(
                Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
              );
      range = {
        from: first.toISOString().slice(0, 10),
        to: last.toISOString().slice(0, 10),
        group: "day",
      };
    }
    this.changed.emit(range);
  }
  update(key: "from" | "to", value: string) {
    if (value) this.changed.emit({ ...this.range(), [key]: value });
  }
}
