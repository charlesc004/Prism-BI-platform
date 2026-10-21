import { Injectable, inject, signal } from "@angular/core";
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
@Injectable({ providedIn: "root" })
export class Api {
  private http = inject(HttpClient);
  notice = signal("");
  get<T>(path: string) {
    return firstValueFrom(this.http.get<T>("/api/v1" + path));
  }
  post<T>(path: string, body: unknown = {}) {
    return firstValueFrom(this.http.post<T>("/api/v1" + path, body));
  }
  patch<T>(path: string, body: unknown) {
    return firstValueFrom(this.http.patch<T>("/api/v1" + path, body));
  }
  delete(path: string) {
    return firstValueFrom(this.http.delete("/api/v1" + path));
  }
  message(error: unknown) {
    return error instanceof HttpErrorResponse
      ? error.error?.error?.message ||
          (error.status === 0
            ? "Cannot reach PRISM. Check your connection and retry."
            : "The request could not be completed.")
      : "Something went wrong. Please retry.";
  }
  async download(path: string, filename: string) {
    try {
      const blob = await firstValueFrom(
        this.http.get("/api/v1" + path, { responseType: "blob" }),
      );
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      this.notice.set(this.message(e));
    }
  }
}
