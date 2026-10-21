import type { Routes } from "@angular/router";
import { authGuard } from "./core/auth/auth.service";
export const routes: Routes = [
  {
    path: "login",
    loadComponent: () =>
      import("./features/auth/login.page").then((m) => m.LoginPage),
  },
  {
    path: "",
    canActivate: [authGuard],
    loadComponent: () =>
      import("./layouts/dashboard-layout").then((m) => m.DashboardLayout),
    children: [
      { path: "", pathMatch: "full", redirectTo: "overview" },
      {
        path: "overview",
        loadComponent: () =>
          import("./features/dashboard/dashboard.page").then(
            (m) => m.DashboardPage,
          ),
      },
      {
        path: "analytics",
        loadComponent: () =>
          import("./features/analytics/analytics.page").then(
            (m) => m.AnalyticsPage,
          ),
      },
      {
        path: "data-sources",
        loadComponent: () =>
          import("./features/data-sources/sources.page").then(
            (m) => m.SourcesPage,
          ),
      },
      {
        path: "synchronization",
        loadComponent: () =>
          import("./features/sync-history/sync.page").then((m) => m.SyncPage),
      },
      {
        path: "data-explorer",
        loadComponent: () =>
          import("./features/data-explorer/explorer.page").then(
            (m) => m.ExplorerPage,
          ),
      },
      {
        path: "reports",
        loadComponent: () =>
          import("./features/reports/reports.page").then((m) => m.ReportsPage),
      },
      {
        path: "settings",
        loadComponent: () =>
          import("./features/settings/settings.page").then(
            (m) => m.SettingsPage,
          ),
      },
    ],
  },
  { path: "**", redirectTo: "overview" },
];
