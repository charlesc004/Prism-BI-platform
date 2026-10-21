import {
  Component,
  inject,
  signal,
  ChangeDetectionStrategy,
} from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { Auth } from "../../core/auth/auth.service";
import { Api } from "../../core/services/api.service";
import { Icon } from "../../shared/ui/icon";
import { Brand } from "../../shared/components/brand";
@Component({
  imports: [ReactiveFormsModule, Icon, Brand],
  template: `<div class="login-page">
    <section class="login-story">
      <header class="brand"><prism-brand /></header>
      <div>
        <span class="eyebrow">YOUR BUSINESS. IN FOCUS.</span>
        <h1>Less noise.<br />More clarity.</h1>
        <p>
          Bring your commerce, payments and marketing data into one clear
          picture.
        </p>
        <div class="login-visual">
          <div class="visual-top">
            <span>Northstar Goods</span
            ><span class="badge">Business workspace</span>
          </div>
          <div class="visual-bars">
            @for (
              h of [34, 48, 41, 60, 53, 76, 64, 89, 78, 96, 88, 110];
              track $index
            ) {
              <span [style.height.px]="h"></span>
            }
          </div>
          <span class="visual-caption"
            >Connected data. Confident decisions.</span
          >
        </div>
      </div>
      <span class="muted">Business intelligence, beautifully connected.</span>
    </section>
    <section class="login-form">
      <div class="login-form-inner">
        <span class="eyebrow">WELCOME TO PRISM</span>
        <h2>A clearer view starts here.</h2>
        <p class="muted">Sign in to your business workspace.</p>
        <form [formGroup]="form" (ngSubmit)="submit()">
          <label
            >Email address<input
              type="email"
              autocomplete="username"
              formControlName="email"
              placeholder="you@company.com" /></label
          ><label
            >Password<input
              type="password"
              autocomplete="current-password"
              formControlName="password"
              placeholder="Enter your password"
          /></label>
          @if (error()) {
            <div class="error-box" role="alert">{{ error() }}</div>
          }
          <button class="btn primary wide" [disabled]="busy() || form.invalid">
            {{ busy() ? "Signing in…" : "Sign in to workspace"
            }}<prism-icon name="arrow" />
          </button>
        </form>
        <div class="login-access">
          <strong>Workspace access</strong>
          <p>Choose an account with the permissions you need.</p>
          <div class="segmented">
            @for (role of accountRoles; track role) {
              <button
                type="button"
                [class.active]="selected() === role"
                [attr.aria-pressed]="selected() === role"
                (click)="select(role)"
              >
                {{ role }}
              </button>
            }
          </div>
          <p class="role-description" aria-live="polite">
            {{ roleDescriptions[selected()] }}
          </p>
          <small>{{ selected() }}&#64;prism.local · PrismAccess2026!</small>
        </div>
      </div>
    </section>
  </div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  auth = inject(Auth);
  api = inject(Api);
  fb = inject(FormBuilder);
  busy = signal(false);
  error = signal("");
  selected = signal<"admin" | "analyst" | "viewer">("admin");
  readonly accountRoles = ["admin", "analyst", "viewer"] as const;
  roleDescriptions = {
    admin:
      "Full access: synchronize sources, manage schedules, workspace settings and team roles, import data, create reports and export.",
    analyst:
      "Analysis access: explore data, import CSV files, create and edit reports, and export. Source synchronization and administration are restricted.",
    viewer:
      "Read-only access: view dashboards, analytics, data and saved reports. Imports, report changes, exports and administration are restricted.",
  };
  form = this.fb.nonNullable.group({
    email: ["admin@prism.local", [Validators.required, Validators.email]],
    password: ["PrismAccess2026!", Validators.required],
  });
  select(role: "admin" | "analyst" | "viewer") {
    this.selected.set(role);
    this.form.patchValue({
      email: role + "@prism.local",
      password: "PrismAccess2026!",
    });
  }
  async submit() {
    if (this.form.invalid) return;
    this.busy.set(true);
    this.error.set("");
    try {
      const { email, password } = this.form.getRawValue();
      await this.auth.login(email, password);
    } catch (e) {
      this.error.set(this.api.message(e));
    } finally {
      this.busy.set(false);
    }
  }
}
