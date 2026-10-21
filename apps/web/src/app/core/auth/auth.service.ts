import { Injectable, inject, signal } from "@angular/core";
import {
  HttpClient,
  HttpInterceptorFn,
  HttpErrorResponse,
} from "@angular/common/http";
import { Router, CanActivateFn } from "@angular/router";
import { firstValueFrom, catchError, switchMap, throwError, from } from "rxjs";
import type { Identity } from "@prism/contracts";
function csrf() {
  return (
    document.cookie
      .split("; ")
      .find((c) => c.startsWith("prism_csrf="))
      ?.split("=")[1] || ""
  );
}
@Injectable({ providedIn: "root" })
export class Auth {
  private http = inject(HttpClient);
  private router = inject(Router);
  user = signal<Identity | null>(null);
  async load() {
    try {
      this.user.set(
        await firstValueFrom(this.http.get<Identity>("/api/v1/auth/me")),
      );
      return true;
    } catch {
      this.user.set(null);
      return false;
    }
  }
  async login(email: string, password: string) {
    await firstValueFrom(
      this.http.post("/api/v1/auth/login", { email, password }),
    );
    await this.load();
    await this.router.navigateByUrl("/overview");
  }
  async logout() {
    await firstValueFrom(this.http.post("/api/v1/auth/logout", {}));
    this.user.set(null);
    await this.router.navigateByUrl("/login");
  }
}
let refreshing: Promise<unknown> | null = null;
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const http = inject(HttpClient),
    router = inject(Router);
  const original = req.clone({
    withCredentials: true,
    setHeaders: req.method !== "GET" ? { "X-CSRF-Token": csrf() } : {},
  });
  return next(original).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !req.url.includes("/auth/login") &&
        !req.url.includes("/auth/refresh")
      ) {
        refreshing ??= firstValueFrom(
          http.post(
            "/api/v1/auth/refresh",
            {},
            { headers: { "X-CSRF-Token": csrf() } },
          ),
        ).finally(() => {
          refreshing = null;
        });
        return from(refreshing).pipe(
          switchMap(() =>
            next(
              req.clone({
                withCredentials: true,
                setHeaders:
                  req.method !== "GET" ? { "X-CSRF-Token": csrf() } : {},
              }),
            ),
          ),
          catchError((refreshError) => {
            void router.navigateByUrl("/login");
            return throwError(() => refreshError);
          }),
        );
      }
      return throwError(() => error);
    }),
  );
};
export const authGuard: CanActivateFn = async () => {
  const auth = inject(Auth),
    router = inject(Router);
  return auth.user() || (await auth.load())
    ? true
    : router.createUrlTree(["/login"]);
};
