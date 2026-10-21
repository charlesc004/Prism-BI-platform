import { Component, ChangeDetectionStrategy } from "@angular/core";

@Component({
  selector: "prism-brand",
  template: `<img
      class="brand-symbol"
      src="/brand-mark.svg"
      alt=""
      width="42"
      height="42"
    /><span>PRISM</span>`,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        gap: 11px;
        font-size: 23px;
        font-weight: 700;
        letter-spacing: 2px;
        line-height: 1;
      }
      .brand-symbol {
        width: 42px;
        height: 42px;
        flex: none;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Brand {}
