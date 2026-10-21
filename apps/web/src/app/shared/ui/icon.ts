import { Component, input, ChangeDetectionStrategy } from "@angular/core";
@Component({
  selector: "prism-icon",
  template: `<svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.65"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path [attr.d]="paths[name()] || paths['grid']" />
  </svg>`,
  styles: [
    `
      :host {
        display: inline-flex;
        width: 19px;
        height: 19px;
        flex: none;
      }
      svg {
        width: 100%;
        height: 100%;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Icon {
  name = input("grid");
  paths: Record<string, string> = {
    grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    chart: "M4 4v16h17 M8 15l4-6 4 3 5-7",
    database:
      "M20 6c0 2-4 3-8 3S4 8 4 6s4-3 8-3 8 1 8 3Z M4 6v12c0 2 4 3 8 3s8-1 8-3V6 M4 12c0 2 4 3 8 3s8-1 8-3",
    sync: "M20 7v5h-5 M4 17v-5h5 M6 6a8 8 0 0 1 13 3 M5 15a8 8 0 0 0 13 3",
    table: "M3 4h18v16H3z M3 9h18 M9 9v11",
    file: "M14 2H5v20h14V7z M14 2v6h6 M8 12h8 M8 16h6",
    settings:
      "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3l-1 3-3 1-2 4 2 3 1 4 4 1 3 2 4-2 1-4 2-3-2-4-3-1-1-3Z",
    arrow: "M5 12h14 M14 7l5 5-5 5",
    down: "m6 9 6 6 6-6",
    check: "m5 12 4 4L19 6",
    clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v6l4 2",
    download: "M12 3v12 m-4-4 4 4 4-4 M4 16v5h16v-5",
    upload: "M12 16V4 m-4 4 4-4 4 4 M4 16v5h16v-5",
    search: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6",
    logout: "M9 3H4v18h5 M10 12h11 m-4-4 4 4-4 4",
    menu: "M4 6h16 M4 12h16 M4 18h16",
    plus: "M12 4v16 M4 12h16",
    dollar: "M12 2v20 M17 6c-6-5-14 3-5 6s1 11-5 6",
    bag: "M4 7h16l1 14H3z M8 8V6a4 4 0 0 1 8 0v2",
    refund: "M9 4 4 9l5 5 M4 9h11a6 6 0 0 1 0 12",
    target:
      "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10 M12 11v2",
    calendar: "M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16",
    help: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M9 9a3 3 0 1 1 4 3v2 M12 17h.01",
    chevron: "m9 5 7 7-7 7",
    close: "M6 6l12 12 M6 18 18 6",
  };
}
