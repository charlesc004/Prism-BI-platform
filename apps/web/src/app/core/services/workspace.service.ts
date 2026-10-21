import { Injectable, inject, signal } from "@angular/core";
import { Api } from "./api.service";

export interface WorkspaceSettings {
  name: string;
  canonical: "SHOPIFY" | "STRIPE";
  timezone: string;
}

@Injectable({ providedIn: "root" })
export class Workspace {
  private api = inject(Api);
  settings = signal<WorkspaceSettings | null>(null);

  async load() {
    const settings = await this.api.get<WorkspaceSettings>(
      "/settings/workspace",
    );
    this.settings.set(settings);
    return settings;
  }

  async save(settings: WorkspaceSettings) {
    const saved = await this.api.patch<WorkspaceSettings>(
      "/settings/workspace",
      settings,
    );
    this.settings.set(saved);
    return saved;
  }
}
