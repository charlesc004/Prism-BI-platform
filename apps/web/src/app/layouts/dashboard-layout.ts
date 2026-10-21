import {
  Component,
  inject,
  signal,
  ChangeDetectionStrategy,
} from "@angular/core";
import {
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
  Router,
  NavigationEnd,
} from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { filter } from "rxjs";
import { Auth } from "../core/auth/auth.service";
import { Api } from "../core/services/api.service";
import { Workspace } from "../core/services/workspace.service";
import { Icon } from "../shared/ui/icon";
import { Brand } from "../shared/components/brand";
@Component({
  selector: "prism-layout",
  imports: [RouterLink, RouterLinkActive, RouterOutlet, Icon, Brand],
  templateUrl: "./dashboard-layout.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardLayout {
  auth = inject(Auth);
  api = inject(Api);
  router = inject(Router);
  mobile = signal(false);
  collapsed = signal(false);
  toggleNav() {
    if (window.matchMedia("(max-width:760px)").matches)
      this.mobile.set(!this.mobile());
    else this.collapsed.set(!this.collapsed());
  }
  title = signal("Overview");
  workspace = inject(Workspace);
  sourceCount = signal<number | null>(null);
  nav = [
    { path: "overview", label: "Overview", icon: "grid" },
    { path: "analytics", label: "Analytics", icon: "chart" },
    { path: "data-sources", label: "Data Sources", icon: "database" },
    { path: "synchronization", label: "Synchronization", icon: "sync" },
    { path: "data-explorer", label: "Data Explorer", icon: "table" },
    { path: "reports", label: "Reports", icon: "file" },
  ];
  constructor() {
    this.updateTitle();
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.updateTitle();
        this.mobile.set(false);
      });
    void this.workspace
      .load()
      .catch((error) => this.api.notice.set(this.api.message(error)));
    void this.api
      .get<unknown[]>("/data-sources")
      .then((s) => this.sourceCount.set(s.length))
      .catch(() => {});
  }
  updateTitle() {
    this.title.set(
      [...this.nav, { path: "settings", label: "Team & Settings" }].find((n) =>
        this.router.url.includes(n.path),
      )?.label || "Overview",
    );
  }
  async logout() {
    try {
      await this.auth.logout();
    } catch (e) {
      this.api.notice.set(this.api.message(e));
    }
  }
}
