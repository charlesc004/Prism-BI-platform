import {
  Component,
  input,
  output,
  ChangeDetectionStrategy,
} from "@angular/core";
import { CurrencyPipe, DatePipe, DecimalPipe } from "@angular/common";
import type { Column } from "@prism/contracts";
import { StatusBadge } from "./status-badge";
@Component({
  selector: "prism-table",
  imports: [CurrencyPipe, DatePipe, DecimalPipe, StatusBadge],
  template: `<div class="table-scroll">
    <table>
      <thead>
        <tr>
          @for (column of columns(); track column.key) {
            <th
              [attr.aria-sort]="
                sortable().includes(column.key)
                  ? column.key === sortKey()
                    ? direction() === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                  : null
              "
            >
              @if (sortable().includes(column.key)) {
                <button class="column-sort" (click)="sort.emit(column.key)">
                  {{ column.label }}
                  @if (column.key === sortKey()) {
                    <span aria-hidden="true">{{
                      direction() === "asc" ? "↑" : "↓"
                    }}</span>
                  }
                </button>
              } @else {
                {{ column.label }}
              }
            </th>
          }
        </tr>
      </thead>
      <tbody>
        @for (row of rows(); track row["id"] || $index) {
          <tr
            tabindex="0"
            (click)="selected.emit(row)"
            (keydown.enter)="selected.emit(row)"
          >
            @for (column of columns(); track column.key) {
              <td>
                @switch (column.type) {
                  @case ("currency") {
                    {{ number(row[column.key]) / 100 | currency: "USD" }}
                  }
                  @case ("date") {
                    {{ string(row[column.key]) | date: "MMM d, y" }}
                  }
                  @case ("number") {
                    {{ number(row[column.key]) | number }}
                  }
                  @case ("status") {
                    <prism-status [value]="string(row[column.key])" />
                  }
                  @default {
                    {{ row[column.key] ?? "—" }}
                  }
                }
              </td>
            }
          </tr>
        } @empty {
          <tr>
            <td [attr.colspan]="columns().length">
              <div class="empty-state">No records match these filters.</div>
            </td>
          </tr>
        }
      </tbody>
    </table>
  </div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataTable {
  columns = input.required<Column[]>();
  rows = input.required<Record<string, unknown>[]>();
  sortable = input<string[]>(["externalId", "occurredAt"]);
  sortKey = input("occurredAt");
  direction = input("desc");
  sort = output<string>();
  selected = output<Record<string, unknown>>();
  number(value: unknown) {
    return Number(value) || 0;
  }
  string(value: unknown) {
    return String(value || "");
  }
}
