import { Component, input, ChangeDetectionStrategy } from "@angular/core";
import { DecimalPipe, CurrencyPipe } from "@angular/common";
import { metrics, type Metric, type MetricValue } from "@prism/contracts";
import { Icon } from "../ui/icon";
@Component({
  selector: "prism-metric",
  imports: [DecimalPipe, CurrencyPipe, Icon],
  template: `<article class="metric-card">
    <div class="metric-top">
      <span>{{ definition().label }}</span
      ><prism-icon [name]="icon()" />
    </div>
    <div class="metric-value" [title]="definition().definition">
      @if (data().value === null) {
        <span class="muted">—</span>
      } @else if (definition().unit === "currency") {
        {{ data().value! / 100 | currency: "USD" : "symbol" : "1.0-0" }}
      } @else {
        {{ data().value | number: "1.0-2" }}
        @if (definition().unit === "ratio") {
          <small>×</small>
        }
      }
    </div>
    <div class="metric-footer">
      @if (data().change !== null) {
        <span class="change" [class.negative]="data().change! < 0"
          >{{ data().change! >= 0 ? "↗" : "↘" }}
          {{ data().change! > 0 ? "+" : ""
          }}{{ data().change | number: "1.0-1" }}%</span
        >
      } @else {
        <span class="muted">—</span>
      }
      <span>vs. previous period</span>
    </div>
  </article>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MetricCard {
  metric = input.required<Metric>();
  data = input.required<MetricValue>();
  icon = input("dollar");
  definition() {
    return metrics[this.metric()];
  }
}
