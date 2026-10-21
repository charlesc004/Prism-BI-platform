import {
  Component,
  input,
  viewChild,
  ElementRef,
  effect,
  OnDestroy,
  ChangeDetectionStrategy,
} from "@angular/core";
import {
  Chart,
  registerables,
  type ChartConfiguration,
  type ChartType,
} from "chart.js";
Chart.register(...registerables);
@Component({
  selector: "prism-chart",
  template: `<div class="chart-area">
    <canvas #canvas role="img" [attr.aria-label]="label()"></canvas>
    @if (!labels().length) {
      <div class="empty-state">No data in this period.</div>
    }
  </div>`,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .chart-area {
        position: relative;
        height: 280px;
      }
      canvas {
        max-width: 100%;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartComponent implements OnDestroy {
  type = input<ChartType>("line");
  labels = input<string[]>([]);
  series = input<{ label: string; data: (number | null)[]; color: string }[]>(
    [],
  );
  label = input("Analytics chart");
  currency = input(true);
  canvas = viewChild<ElementRef<HTMLCanvasElement>>("canvas");
  private chart?: Chart;
  constructor() {
    effect(() => {
      const canvas = this.canvas(),
        labels = this.labels(),
        series = this.series(),
        type = this.type();
      if (!canvas) return;
      const fontFamily = getComputedStyle(canvas.nativeElement).fontFamily;
      this.chart?.destroy();
      const config: ChartConfiguration = {
        type,
        data: {
          labels,
          datasets: series.map((s, i) => ({
            label: s.label,
            data: s.data,
            borderColor: s.color,
            backgroundColor:
              type === "doughnut"
                ? series.map((x) => x.color)
                : s.color + (type === "bar" ? "" : "13"),
            fill: type === "line" && i === 0,
            tension: 0.22,
            borderWidth: type === "line" ? 2 : 0,
            pointRadius: 0,
            pointHoverRadius: 4,
            borderRadius: type === "bar" ? 7 : 0,
          })),
        },
        options: {
          animation: false,
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: {
              display: type === "doughnut",
              position: "bottom",
              labels: {
                usePointStyle: true,
                padding: 20,
                font: { family: fontFamily, size: 12 },
              },
            },
            tooltip: {
              backgroundColor: "#234936",
              padding: 12,
              titleFont: { family: fontFamily, size: 12, weight: 600 },
              bodyFont: { family: fontFamily, size: 12 },
              callbacks: {
                label: (ctx) =>
                  `${ctx.dataset.label}: ${this.currency() ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(ctx.raw)) : ctx.raw}`,
              },
            },
          },
          scales:
            type === "doughnut"
              ? {}
              : {
                  x: {
                    grid: { display: false },
                    ticks: {
                      maxTicksLimit: 7,
                      color: "#5e705b",
                      font: { family: fontFamily, size: 12 },
                    },
                    border: { display: false },
                  },
                  y: {
                    beginAtZero: true,
                    grid: { color: "#e8eadd" },
                    border: { display: false },
                    ticks: {
                      color: "#5e705b",
                      font: { family: fontFamily, size: 12 },
                      callback: (value) =>
                        this.currency()
                          ? "$" +
                            new Intl.NumberFormat("en", {
                              notation: "compact",
                            }).format(Number(value))
                          : value,
                    },
                  },
                },
        },
      };
      this.chart = new Chart(canvas.nativeElement, config);
    });
  }
  ngOnDestroy() {
    this.chart?.destroy();
  }
}
