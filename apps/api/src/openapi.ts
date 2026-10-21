import { z } from "zod";
import { reportSchema } from "@prism/contracts";
const operations: [string, string, string, string][] = [
  ["post", "/auth/login", "Sign in with email and password", "Authentication"],
  ["post", "/auth/refresh", "Rotate the refresh token", "Authentication"],
  ["post", "/auth/logout", "Revoke the current session", "Authentication"],
  ["get", "/auth/me", "Current user and workspace role", "Authentication"],
  ...["summary", "trends", "sources"].map(
    (name) =>
      [
        "get",
        `/dashboard/${name}`,
        "Aggregated persisted analytics",
        "Analytics",
      ] as [string, string, string, string],
  ),
  ...[
    "revenue",
    "orders",
    "payments",
    "refunds",
    "campaigns",
    "comparison",
  ].map(
    (name) =>
      [
        "get",
        `/analytics/${name}`,
        "Aggregated persisted analytics",
        "Analytics",
      ] as [string, string, string, string],
  ),
  ["get", "/data-sources", "List sources without credentials", "Data sources"],
  [
    "get",
    "/data-sources/{id}",
    "Source details and recent runs",
    "Data sources",
  ],
  ["get", "/data-sources/{id}/status", "Source status", "Data sources"],
  [
    "post",
    "/data-sources/{id}/sync",
    "Queue synchronization (Admin)",
    "Synchronization",
  ],
  [
    "get",
    "/data-sources/{id}/sync-runs",
    "Source synchronization history",
    "Synchronization",
  ],
  [
    "patch",
    "/data-sources/{id}/schedule",
    "Configure off/hourly/daily schedule (Admin)",
    "Synchronization",
  ],
  [
    "get",
    "/data-sources/{id}/schedule",
    "Current recurring schedule (Admin)",
    "Synchronization",
  ],
  [
    "get",
    "/sync-runs",
    "Latest 100 workspace synchronization runs",
    "Synchronization",
  ],
  [
    "get",
    "/operations",
    "API, database, Redis and worker availability",
    "Synchronization",
  ],
  [
    "post",
    "/imports/csv",
    "Upload campaign CSV (Admin/Analyst), maximum 2 MB",
    "Imports",
  ],
  ["get", "/imports", "Latest 50 import batches", "Imports"],
  ["get", "/imports/{id}", "Import summary", "Imports"],
  ["get", "/imports/{id}/errors", "Row-level validation errors", "Imports"],
  ["get", "/data/{dataset}", "Filtered paginated records", "Data Explorer"],
  [
    "get",
    "/data/{dataset}/export",
    "Filtered CSV export, maximum 10,000 records (Admin/Analyst)",
    "Data Explorer",
  ],
  ["get", "/reports", "Saved workspace reports", "Reports"],
  ["post", "/reports", "Save a report (Admin/Analyst)", "Reports"],
  ["get", "/reports/{id}", "Saved report configuration", "Reports"],
  ["patch", "/reports/{id}", "Edit report (Admin/Analyst)", "Reports"],
  ["delete", "/reports/{id}", "Delete report (Admin/Analyst)", "Reports"],
  ["post", "/reports/{id}/preview", "Preview a saved report", "Reports"],
  [
    "post",
    "/report-preview",
    "Preview a validated draft (Admin/Analyst)",
    "Reports",
  ],
  [
    "get",
    "/reports/{id}/export",
    "Export a saved report as CSV (Admin/Analyst)",
    "Reports",
  ],
  ["get", "/settings/workspace", "Workspace settings", "Settings"],
  [
    "patch",
    "/settings/workspace",
    "Update reporting preferences (Admin)",
    "Settings",
  ],
  ["get", "/settings/team", "Workspace members (Admin)", "Settings"],
  ["patch", "/settings/team/{id}", "Update member role (Admin)", "Settings"],
  [
    "get",
    "/audit",
    "Latest 50 administrative audit events (Admin)",
    "Settings",
  ],
];
const paths: Record<string, Record<string, unknown>> = {};
for (const [method, path, summary, tag] of operations) {
  const publicOperation = path === "/auth/login" || path === "/auth/refresh";
  const parameters: unknown[] = [...path.matchAll(/\{(\w+)\}/g)].map(
    (match) => ({
      in: "path",
      name: match[1],
      required: true,
      schema:
        match[1] === "dataset"
          ? { type: "string", enum: ["orders", "payments", "campaign-spend"] }
          : { type: "string" },
    }),
  );
  if (method !== "get" && path !== "/auth/login")
    parameters.push({
      in: "header",
      name: "X-CSRF-Token",
      required: true,
      schema: { type: "string" },
      description: "Value of the readable prism_csrf cookie.",
    });
  if (
    path.startsWith("/analytics/") ||
    path.startsWith("/dashboard/") ||
    path.startsWith("/data/")
  )
    for (const name of [
      "from",
      "to",
      "sourceId",
      "group",
      ...(path.startsWith("/data/")
        ? ["page", "pageSize", "search", "sort", "direction"]
        : []),
    ])
      parameters.push({
        in: "query",
        name,
        schema: { type: "string" },
        description:
          name === "to"
            ? "Inclusive final calendar date in workspace timezone."
            : name === "group"
              ? "day, week or month"
              : name === "pageSize"
                ? "1–100, default 20"
                : undefined,
      });
  let requestBody: unknown;
  if (path === "/auth/login")
    requestBody = {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["email", "password"],
            properties: {
              email: { type: "string", format: "email" },
              password: { type: "string" },
            },
          },
        },
      },
    };
  if (
    (path === "/reports" && method === "post") ||
    (path === "/reports/{id}" && method === "patch") ||
    path === "/report-preview"
  )
    requestBody = {
      required: true,
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ReportDefinition" },
        },
      },
    };
  if (path === "/imports/csv" && method === "post")
    requestBody = {
      required: true,
      content: {
        "multipart/form-data": {
          schema: {
            type: "object",
            required: ["file"],
            properties: { file: { type: "string", format: "binary" } },
          },
        },
      },
    };
  if (method === "patch" && tag === "Settings")
    requestBody = {
      required: true,
      content: {
        "application/json": {
          schema: path.includes("/team/")
            ? {
                type: "object",
                required: ["role"],
                properties: { role: { enum: ["ADMIN", "ANALYST", "VIEWER"] } },
              }
            : {
                type: "object",
                required: ["name", "timezone", "canonical"],
                properties: {
                  name: { type: "string", maxLength: 80 },
                  timezone: { type: "string", description: "IANA timezone" },
                  canonical: { enum: ["SHOPIFY", "STRIPE"] },
                },
              },
        },
      },
    };
  if (path.endsWith("/schedule"))
    requestBody = {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["schedule"],
            properties: { schedule: { enum: ["off", "hourly", "daily"] } },
          },
        },
      },
    };
  paths[path] ??= {};
  paths[path][method] = {
    summary,
    tags: [tag],
    parameters,
    security: publicOperation ? [] : [{ session: [] }],
    ...(requestBody ? { requestBody } : {}),
    responses: {
      [method === "delete"
        ? "204"
        : path.endsWith("/sync") ||
            (path === "/imports/csv" && method === "post")
          ? "202"
          : path === "/reports" && method === "post"
            ? "201"
            : "200"]: {
        description: path.endsWith("/export")
          ? "RFC 4180 CSV with spreadsheet formula protection. Money is integer USD cents."
          : "Successful response. Lists are bounded; analytics amounts are integer USD cents, ratios are unscaled.",
      },
      "400": { description: "Invalid input or CSV" },
      "401": { description: "Session absent or expired" },
      "403": { description: "Insufficient role or invalid CSRF token" },
      "404": { description: "Resource absent from current workspace" },
      "409": { description: "Source already syncing or configuration missing" },
      "503": { description: "Queue unavailable" },
    },
  };
}
export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "PRISM API",
    version: "1.0.0",
    description:
      "Single-workspace business intelligence. All resources are scoped to the authenticated membership. Reporting intervals use workspace calendar days; date ranges are limited to 400 days. Monetary values use integer cents. Login issues HttpOnly access/refresh cookies and a readable CSRF cookie.",
  },
  servers: [{ url: "/api/v1" }],
  paths,
  components: {
    securitySchemes: {
      session: { type: "apiKey", in: "cookie", name: "prism_access" },
    },
    schemas: { ReportDefinition: z.toJSONSchema(reportSchema) },
  },
};
