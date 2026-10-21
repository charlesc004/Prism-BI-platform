# PRISM implementation report

Verified on 20 October 2026 and reviewed on 21 October using Windows, Node 24.15, PostgreSQL 16 and Redis 7 in WSL. This delivers a working, persisted local application. Docker builds, service startup, tests and persistent-volume recreation were also verified; actual provider-account verification remains outstanding. See [QUALITY_REVIEW.md](QUALITY_REVIEW.md) for the desktop/mobile review and [DOCKER_VERIFICATION.md](DOCKER_VERIFICATION.md) for container results.

## 1. Completed application features

- Responsive Angular application: login, overview, six analytics charts, source details, synchronization history, data explorer, saved reports, workspace settings, existing-member roles and audit history.
- Real authentication with hashed passwords and tokens, rotating refresh sessions, CSRF protection and server-enforced Admin/Analyst/Viewer permissions.
- Persisted generated data: 4,209 orders, 4,209 payments and 1,580 campaign records over 395 days. Charts query PostgreSQL through the API.
- Background synchronization, progress polling, retries, incremental generated/Shopify checkpoints, duplicate prevention and persisted failure states.
- Validated CSV uploads with background processing, row-level errors and duplicate-file detection.
- Explorer filtering, search, bounded pagination, supported sorting, record details and CSV exports. Saved reports support creation, editing, preview, deletion and export.
- Redis analytics cache, invalidation, source freshness warnings, readiness checks and an OpenAPI endpoint catalog.

## 2. Final folder architecture

```text
apps/web/src/app/{core,layouts,shared,features}/
apps/web/tests/                    Angular component tests
apps/api/prisma/                   Schema, SQL migration, seed
apps/api/src/config/               Validated environment and connections
apps/api/src/modules/              Auth, analytics, ingestion, sync, explorer, exports
apps/api/src/providers/            Contracts, registry, generated, live adapters, CSV
apps/api/src/jobs/                 Queues, processors, retry transitions, worker
apps/api/src/http/                 Focused HTTP routers behind central authentication
apps/api/tests/                    Domain/provider and integration tests
packages/contracts/               Shared DTOs, Zod schemas, metric definitions
fixtures/                         Generated configuration, HTTP fixtures, CSV examples
tests/e2e/                        Playwright browser journeys
infrastructure/                   Container builds and Nginx
.github/workflows/                CI configuration
```

Angular uses standalone components, Signals, OnPush, lazy routes, Reactive Forms and HttpClient. Express routes authorize and validate requests; shared domain services own ingestion and analytics. Adapters are independent of Express and Prisma.

## 3. Reusable components

`MetricCard`, `DateRangeFilter`, typed `DataTable`, `StatusBadge`, `ChartComponent` and the SVG `Icon` component share formatting and interaction behavior. The application shell provides desktop collapse and mobile navigation. API access, authentication refresh and CSRF handling are centralized. CDK focus traps support source/record dialogs.

## 4. Provider integration architecture

The provider interface returns pages of validated normalized commerce, payment or campaign records plus pagination/checkpoint metadata. Generated adapters and live adapters feed the same persistence functions.

- **Generated:** deterministic generated records with paginated replay and a one-day incremental overlap.
- **Shopify:** GraphQL orders, updated-at filtering, cursor pagination, money normalization, refunds and cancellation mapping; explicit server-side shop/token/API-version configuration.
- **Stripe:** test-mode REST charges, pagination, integer amounts and refunds. Each run reconciles full bounded history to capture later refunds.
- **CSV:** bounded parsing, required fields, USD validation, stable row identity, import summaries and row errors.

HTTP adapters have timeouts and bounded rate-limit retries. Unit tests inject fixture transports; real provider access is blocked in the test environment. Neither Shopify nor Stripe was verified against an actual account.

## 5. Synchronization workflow

An authorized request atomically claims a source, creates a database run and audit event, then enqueues its ID. A separate BullMQ worker fetches and validates pages, commits records and counters, and invalidates analytics. Checkpoints advance only after a complete successful scan.

Source/external-ID uniqueness and update-or-insert persistence make repeated pages safe. Partial commits survive retries. Three attempts use exponential backoff with jitter; retry/failure states are persisted before errors propagate. Atomic claims prevent overlapping source scans. BullMQ handles stalled jobs; worker startup reconciles pending database work missing queue jobs. Hourly/daily schedules use persistent BullMQ schedulers. A Redis heartbeat contributes to readiness.

## 6. Database architecture

PostgreSQL stores workspaces, users, memberships, hashed sessions, source connections, sync runs, orders, payments, campaign spend, import batches, saved reports and audit events. Prisma manages schema access and the checked-in initial migration.

Financial amounts use integer cents. Foreign keys, source/external-ID unique constraints and workspace/date indexes enforce integrity. API lookups derive workspace scope from authenticated membership; cross-workspace source/report access is covered by integration tests. Redis holds queues, schedules, heartbeat and short-lived aggregates, while PostgreSQL remains authoritative.

## 7. Analytics and metric definitions

Revenue uses one workspace-configured canonical provider. Shopify orders and Stripe payments are never added together. Successful live commerce ingestion excludes its generated counterpart from default analytics.

| Metric              | Calculation                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| Net revenue         | Paid, non-cancelled order gross minus discounts/refunds, or successful Stripe charges minus refunds |
| Order count         | Paid, non-cancelled commerce orders                                                                 |
| Average order value | Net order sales divided by order count, rounded to cents                                            |
| Refunds             | Canonical-provider refunds assigned to the original event date                                      |
| Marketing spend     | Imported USD campaign spend                                                                         |
| Revenue / spend     | Blended revenue divided by spend; no campaign attribution implied                                   |
| Comparison          | Change against the preceding equal calendar period; missing/zero prior values produce null          |

Calendar filters and SQL buckets honor IANA workspace timezones and DST with half-open UTC intervals. Missing data is distinct from zero. Reports, charts and exports use the same analytics service. Cache keys include workspace, filters and a data version; entries expire after 60 seconds. See README for provider-total, currency and accounting qualifications.

## 8. Local setup commands

With PostgreSQL and Redis running, configure the URLs in `.env`:

```powershell
npm ci
Copy-Item .env.example .env
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open [PRISM](http://localhost:4400). The API listens on port 3000. `npm run dev` starts the API, web application and worker. The seed refuses production execution. `SEED_REFERENCE_DATE` fixes the fixture window; update it or omit it and reseed when running at a later date.

`docker compose up --build` starts the app on port 8080. Container builds, startup, all 51 tests and persistent-volume recreation were verified using Docker Engine in Ubuntu 24.04 WSL. See [DOCKER_VERIFICATION.md](DOCKER_VERIFICATION.md) for actual results and [README.md](README.md) for prerequisites and startup commands.

## 9. Workspace credentials

| Role    | Email               | Password         |
| ------- | ------------------- | ---------------- |
| Admin   | admin@prism.local   | PrismAccess2026! |
| Analyst | analyst@prism.local | PrismAccess2026! |
| Viewer  | viewer@prism.local  | PrismAccess2026! |

These are workspace accounts. Admin manages sources/settings/roles; Analyst can create reports and export; Viewer has read access.

## 10. Tests actually executed and results

| Check                              | Observed result                                                           |
| ---------------------------------- | ------------------------------------------------------------------------- |
| ESLint                             | Passed                                                                    |
| Type checking                      | Passed for API, contracts and Angular development build                   |
| Production build                   | Passed; initial web bundle approximately 329 kB, 88 kB estimated transfer |
| Domain/provider tests              | 16 passed                                                                 |
| Angular component tests            | 5 passed using Angular's unit-test builder                                |
| PostgreSQL/Redis integration tests | 18 passed against isolated `prism_test` and Redis database 1              |
| Playwright browser tests           | 12 passed using installed Chrome                                          |
| Dependency audit                   | 0 known vulnerabilities reported by `npm audit`                           |
| Migration and seed                 | Executed successfully against real local PostgreSQL                       |
| Visual verification                | Desktop dashboard and 390 px mobile layout inspected                      |

The 51 automated tests cover financial arithmetic and missing values, timezone/DST, CSV validation and export safety, provider pagination/refunds/rate limits, auth/CSRF/RBAC and workspace isolation, real queued ingestion, idempotence, checkpoint preservation, partial/final failure, analytics, report exports and full browser workflows. The quality review adds mobile/desktop page matrices, real sorting, schedule read-back, report editing, workspace updates, stale responses, error recovery, atomic refresh rotation and lost queue acknowledgements.

Playwright's bundled Chromium was unavailable and its download was blocked in this environment. The documented `PLAYWRIGHT_CHANNEL=chrome` override ran the suite successfully, including 12 tests against the Docker app in 55.1 seconds. No provider-account test success is claimed. CI configuration is included but has not been run on a hosted CI service here.

## 11. Known limitations

- Single-workspace application; no tenant provisioning, email invitations, account recovery, billing or UI for creating users. Team administration edits existing members.
- Live adapters require credentials and account-level verification. No Shopify OAuth installation flow or provider webhooks. Stripe is test-mode only and uses full reconciliation rather than an event-based incremental cursor.
- USD only; no currency conversion, attributed ROAS, settlement accounting or refund-date cash accounting. Provider totals can include tax/shipping.
- CSV uploads are limited to 2 MB/10,000 rows; raw exports to 10,000 records and analytics periods to 400 days. Large workloads need streaming/object storage and broader operational capacity testing.
- Campaign uploads augment generated campaigns; overlapping business datasets require explicit source filters or dataset cleanup.
- Cache invalidation failure can leave an older aggregate until the 60-second TTL expires. Queue operations require Redis.
- History responses are bounded; long-term retention, backup/restore, production deployment, load testing and disaster recovery are not implemented or verified.
- Hosted CI execution remains unverified. Local Docker/HTTP configuration is for development; production deployment needs HTTPS and appropriate operational configuration.
