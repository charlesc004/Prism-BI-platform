import {
  Component,
  inject,
  signal,
  ChangeDetectionStrategy,
} from "@angular/core";
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
  FormsModule,
} from "@angular/forms";
import { DatePipe } from "@angular/common";
import { Api } from "../../core/services/api.service";
import { Auth } from "../../core/auth/auth.service";
import { Workspace } from "../../core/services/workspace.service";
interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
}
@Component({
  imports: [ReactiveFormsModule, FormsModule, DatePipe],
  template: `<div class="page-heading">
      <div>
        <div class="eyebrow">MAKE IT YOURS</div>
        <h1>Team & Settings<span class="heading-dot">.</span></h1>
        <p>Your workspace, people and reporting preferences.</p>
      </div>
    </div>
    @if (error()) {
      <div class="error-box" role="alert">{{ error() }}</div>
    }
    <div class="settings-grid">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>Workspace settings</h2>
            <p>Reporting uses the selected timezone and currency.</p>
          </div>
        </div>
        <form [formGroup]="form" (ngSubmit)="save()" class="settings-form">
          <fieldset [disabled]="auth.user()?.role !== 'ADMIN'">
            <label>Workspace name<input formControlName="name" /></label
            ><label
              >Canonical revenue source<select formControlName="canonical">
                <option value="SHOPIFY">Shopify · order-based revenue</option>
                <option value="STRIPE">Stripe · payment-based revenue</option>
              </select></label
            ><label
              >Reporting timezone<input
                formControlName="timezone"
                placeholder="America/New_York"
            /></label>
            <p class="definition-note">
              Currency: USD. Other currencies are rejected during ingestion. No
              exchange-rate conversion is performed.
            </p>
          </fieldset>
          @if (auth.user()?.role === "ADMIN") {
            <button class="btn primary" [disabled]="form.invalid || busy()">
              Save changes
            </button>
          } @else {
            <p class="muted">
              Workspace settings are managed by an administrator.
            </p>
          }
        </form>
      </section>
      <section class="panel">
        <div class="panel-header"><h2>Your profile</h2></div>
        <div class="settings-form">
          <div class="profile-avatar">{{ auth.user()?.name?.slice(0, 1) }}</div>
          <h2>{{ auth.user()?.name }}</h2>
          <p>{{ auth.user()?.email }}</p>
          <span class="mode-tag">{{ auth.user()?.role }}</span>
          <p class="definition-note">
            Sessions use HttpOnly cookies. Your role is enforced by the API on
            every protected operation.
          </p>
        </div>
      </section>
    </div>
    @if (auth.user()?.role === "ADMIN") {
      <section class="panel settings-team">
        <div class="panel-header">
          <div>
            <h2>Workspace team</h2>
            <p>Manage permissions for existing workspace members.</p>
          </div>
        </div>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              @for (member of team(); track member.id) {
                <tr>
                  <td>
                    <strong>{{ member.name }}</strong>
                  </td>
                  <td>{{ member.email }}</td>
                  <td>
                    <select
                      [attr.aria-label]="'Role for ' + member.name"
                      [ngModel]="member.role"
                      [disabled]="member.id === auth.user()?.id"
                      (ngModelChange)="changeRole(member.id, $event)"
                    >
                      <option>ADMIN</option>
                      <option>ANALYST</option>
                      <option>VIEWER</option>
                    </select>
                  </td>
                  <td>{{ member.active ? "Active" : "Inactive" }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
      <section class="panel settings-team">
        <div class="panel-header"><h2>Audit trail</h2></div>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Action</th>
                <th>Resource</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              @for (event of audit(); track event.id) {
                <tr>
                  <td>{{ event.action }}</td>
                  <td class="mono">{{ event.resourceId }}</td>
                  <td>{{ event.createdAt | date: "medium" }}</td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="3">No administrative activity yet.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPage {
  api = inject(Api);
  auth = inject(Auth);
  workspace = inject(Workspace);
  fb = inject(FormBuilder);
  team = signal<TeamMember[]>([]);
  audit = signal<
    { id: string; action: string; resourceId: string; createdAt: string }[]
  >([]);
  error = signal("");
  busy = signal(false);
  form = this.fb.nonNullable.group({
    name: ["", Validators.required],
    canonical: ["SHOPIFY" as "SHOPIFY" | "STRIPE"],
    timezone: ["UTC", Validators.required],
  });
  constructor() {
    void this.load();
  }
  async load() {
    try {
      this.form.patchValue(await this.workspace.load());
      if (this.auth.user()?.role === "ADMIN") {
        this.team.set(await this.api.get("/settings/team"));
        this.audit.set(await this.api.get("/audit"));
      }
    } catch (e) {
      this.error.set(this.api.message(e));
    }
  }
  async save() {
    this.busy.set(true);
    try {
      await this.workspace.save(this.form.getRawValue());
      this.api.notice.set("Workspace settings saved.");
      this.error.set("");
      await this.load();
    } catch (e) {
      this.error.set(this.api.message(e));
    } finally {
      this.busy.set(false);
    }
  }
  async changeRole(id: string, role: string) {
    try {
      await this.api.patch("/settings/team/" + id, { role });
      await this.load();
      this.api.notice.set("Team permissions updated.");
    } catch (e) {
      this.error.set(this.api.message(e));
    }
  }
}
