# PRISM quality review

Review conducted on 20–21 October 2026 against the running local application, real PostgreSQL/Redis services and installed Chrome. This report describes observed coverage, not a guarantee that every possible input/device is defect-free.

## Functional corrections

- Route and table hosts now render as blocks. An inline Angular host had intercepted pointer events over table sorting controls; browser hit-testing and an actual click regression confirmed the correction.
- Explorer headers expose the active sort key/direction visually and with `aria-sort`. Database sorting adds an ID tie-breaker for stable pagination.
- Analytics ignores older in-flight responses after the reporting filter changes. A component regression controls response order explicitly.
- Report previews capture their requested metric and ignore superseded responses. Save/delete controls prevent overlapping changes, and unsaved report configurations cannot export an older saved definition as though it were the preview.
- Source details read back the persisted BullMQ schedule. Closing/reopening a source preserves the displayed schedule. Unsupported CSV/live-unconfigured schedules are rejected server-side.
- A shared workspace service updates the sidebar and dashboard name immediately after settings changes.
- Source-loading failures in Explorer/Reports are handled instead of producing unhandled promises.
- Malformed and oversized JSON receive structured 400/413 errors with request IDs. CSRF comparison checks byte lengths before constant-time comparison, including non-ASCII invalid inputs.
- Concurrent identical CSV uploads converge on one persisted import batch through the database uniqueness constraint.
- Blank CSV count fields no longer silently become zero. Counts outside PostgreSQL's supported range are reported as row errors before background ingestion.
- Refresh token consumption and replacement now commit in one transaction. Concurrent reuse produces one successful rotation and one unauthorized response.
- Redis queue connections decode URL-encoded usernames/passwords and validate database indexes, including TLS URLs.
- CSV submission retains the durable payload when enqueue fails, including ambiguous Redis acknowledgements. The same file resumes the same batch; concurrent inserts converge through the database constraint.
- Synchronization enqueue errors retain the run and source claim, preventing a second scan when the first job may already have been accepted. Worker startup repairs a missing job using its stable ID.
- API shutdown drains in-flight requests before closing database and queue connections. Worker shutdown ignores duplicate stop signals. Container entry points deliver signals directly to Node.
- The login form's intrinsic width no longer expands its mobile grid column. Login is checked at 320, 390, 768, 1024 and 1440 px.

- Clean installation exposed a terminal-state race in ingestion failure handling: `SyncRun` could become `FAILED` while its source still read `SYNCING`. Failure status, source status and import cleanup now commit in one transaction; analytics invalidation follows the commit. The previously failing 18-test integration suite passed twice after correction.

## Code cleanup

- Standardized workspace presentation across login, navigation, sources and documentation. Generated source adapters now use `GeneratedProvider`, source mode `GENERATED`, and `SEED_REFERENCE_DATE` / `SEED_PASSWORD` configuration. A versioned migration updates persisted modes. The unpublished initial baseline also uses `GENERATED`; its recorded checksum was reconciled in all four local application and test databases after full backups, with every application table fingerprint and all other migration metadata verified unchanged. Application and test databases were migrated; existing source identities, 4,209 orders and 4,209 payments were retained in both native and container environments.
- Split the large API router into seven HTTP modules: analytics, sources, imports, explorer, reports, settings and operations. Authorization remains behind the same central authentication boundary.
- Centralized source ownership lookup, audit creation and dependency health checks.
- Replaced three copied ingestion algorithms with one typed persistence algorithm and small model-specific Prisma adapters. No `any` escape hatch was introduced.
- Removed the duplicated campaign search predicate used by count and record queries.
- Scheduled and ordinary jobs now share one dispatcher between the real worker and integration tests.
- Removed 20 shadowed CSS declarations. Added consistent minimum text sizing and corrected structural host behavior.
- Added Angular-aware Prettier configuration; formatted application files, tests, fixtures and the Prisma schema. Generated code and local artifacts remain excluded.
- Updated the development toolchain to Vite 8.3.4 through a root override, keeping Angular 22.2.3. The registry audit had identified the older pinned Vite copy through [GHSA-698v-4r3x-3vcv](https://github.com/advisories/GHSA-698v-4r3x-3vcv). Moving Angular's builder to root tooling ensures npm applies the override to its dependency tree.
- Pinned the project runtime to Node 24.22.0 and aligned `.node-version`, package engines, lockfile and CI. Startup rejects unsupported runtimes. Restored normal Angular dependency prebundling after native Windows verification; cache and worker overrides are not needed. The development launcher stops all three services when one command exits.
- Replaced the old triangle with a shared faceted PRISM mark. Login, navigation and favicon use the same SVG; removed obsolete logo styles. Generated account buttons expose the selected state and describe each role's actual permissions.
- Extracted CSV submission from the HTTP handler into one ingestion service, including deduplication and durable queue recovery behavior.

Repeated model adapters, independent request-state counters, and test fixtures remain where their separate types or behavior are useful; they are not collapsed into a generic framework solely to reduce line counts.

## Database baseline verification

The initial unpublished migration sets source mode to `GENERATED`. Before aligning the applied checksum, application writers were stopped and full PostgreSQL backups were created for native and container application/test databases. Archive listings were validated before any changes.

Each database retained identical row counts and full-row fingerprints across all 12 application tables. Only the expected initial checksum changed in migration history; IDs, timestamps and remaining metadata stayed identical. Deployment and schema comparison succeeded against all four existing databases. Both migrations also applied successfully to separate empty native and container databases, with no schema differences afterward. Those temporary verification databases were removed; existing databases and volumes were retained.

## Desktop and mobile review

Overview, Analytics, Data Sources, Synchronization, Data Explorer, Reports and Settings were inspected at **320, 390, 768, 1024 and 1440 px**, producing 35 page/viewport checks. Final layout inspection found no document-level horizontal overflow, visible text below 11 px, or browser JavaScript errors in those checks. Wide datasets deliberately scroll within their table containers.

Two 320 px overflow defects were corrected: a long breadcrumb in Synchronization and intrinsic grid/input widths in Reports. Small report forms stack vertically. Mobile controls have larger targets, and source rows can wrap.

Contrast checks sampled rendered DOM text against computed ancestor backgrounds on the seven desktop pages. The initial scan found low-contrast secondary text; 42 CSS color declarations were darkened and the dark hero's muted text was corrected. The final sampled scan found no failing text pairs at the selected 4.5:1 normal / 3:1 large-text thresholds. This is a focused automated check, not a full WCAG certification; pseudo-elements, all transient states, screen readers and physical mobile browsers are not exhaustively covered.

Screenshots were visually inspected for the desktop overview, login, data sources/explorer and narrow mobile forms/history. Responsive browser emulation uses Chromium/Chrome; actual iOS Safari and Android devices remain unverified.

## Automated coverage

Final local verification: **51 automated tests passed**.

| Check                                             | Result                                   |
| ------------------------------------------------- | ---------------------------------------- |
| Domain/provider tests                             | 16 passed                                |
| PostgreSQL/Redis integration tests                | 18 passed                                |
| Angular component tests                           | 5 passed                                 |
| Playwright browser tests                          | 12 passed in 1.2 minutes                 |
| Strict API/contracts and Angular production build | Passed                                   |
| ESLint                                            | Passed                                   |
| Prettier formatting                               | Passed                                   |
| Prisma schema formatting                          | Completed                                |
| Dependency audit                                  | 0 known vulnerabilities reported         |
| Layout matrix                                     | 35 checks, no overflow or browser errors |

The final native Windows browser suite completed with Node 24.22.0 and normal development prebundling enabled. Earlier failures and an intermittent successful baseline run were retained as diagnostic evidence; an isolated passing run on the older runtime was not treated as proof that the intermittent failure had disappeared.

The same 51 tests also passed against the Docker environment: 16 domain/provider, 18 integration and 5 component tests inside the Linux image, plus 12 Chrome browser tests against the built web app in 55.1 seconds. Compose readiness, real queue/import/report smoke checks and recreation with persistent volumes passed. The shared multi-stage Dockerfile replaces duplicated dependency-install/build definitions. See [DOCKER_VERIFICATION.md](DOCKER_VERIFICATION.md) for commands, service versions and observed persistence counts.

- Domain/provider tests: exact money, missing/zero values, no double-counting, DST, cache identity, CSV validation/formula protection, deterministic pagination, fixture HTTP mappings/rate limits/failures.
- Database/queue integration: authentication, CSRF, permissions, workspace isolation, scheduled settings, concurrent uploads, actual queued ingestion, partial/final retries, checkpoint preservation, idempotence, changed-record updates, analytics, explorer and report lifecycle/export.
- Angular components: metric rendering, keyboard row details, date events, actual sort direction and stale analytics responses.
- Browser journeys: Admin/Analyst/Viewer behavior, all pages at phone/tablet/desktop sizes, source scheduling, workspace changes and restoration, dataset switches, keyboard dialogs, report creation/edit/export/delete, session refresh and API-error retry. Full editing workflows run at both 390 and 1440 px.

Reproduce with the commands in README. Browser tests use `PLAYWRIGHT_CHANNEL=chrome` on this workstation. Run bulk layout inspection and browser tests separately: large suites share one IP and can exceed the intentional 300 requests/minute limit. The browser fixture reads the server's rate-limit budget and waits for its reset before another large journey when needed. Production limits remain enabled.

## Native Windows development stability

The previous Windows process exited with `0xC0000409`, without a JavaScript exception or captured native dump. Disabling prebundling, selecting SQLite caching and reducing build workers did not reliably prevent it. A subsequent run on the old runtime also passed, confirming that the symptom was intermittent. The exit code alone does not establish a particular native stack.

The workstation had system Node 24.11.1 and project Node 24.15.0. The project now pins Node **24.22.0** in its dependency/lockfile and `.node-version`; npm scripts consistently select it. Node's [official changelog](https://github.com/nodejs/node/blob/v24.22.0/doc/changelogs/CHANGELOG_V24.md) includes the [Windows libuv assertion fix](https://github.com/nodejs/node/pull/61999). This removes a known native-runtime failure path; attribution of the original exit to that exact assertion remains an inference. No application exception was found in the failed runs.

The root and web development commands validate the runtime before launch. `concurrently --kill-others` stops sibling commands if one command exits. An injected web-process failure confirmed a nonzero launcher exit, released ports 3000/4400 and no remaining native worker. This behavior reports failures instead of restarting indefinitely or leaving a partly running application.

Normal Angular dependency prebundling is restored. No temporary cache-store, worker-count, Babel-linker or memory overrides are required. Native verification on Node 24.22.0 passed all 12 full browser journeys, 16 domain tests, 18 integration tests and 5 component tests; production build and lint also passed. The workspace smoke suite targeted port 4400 and verified real native PostgreSQL/Redis, queue synchronization, CSV ingestion, report lifecycle and all three account roles. The shared smoke runner now has explicit `test:native` and `test:compose` commands; native smoke also passed with every project container stopped.

`npm run test:dev-server` adds an independent native regression: 30 browser context disconnects across three viewport widths, live CSS rebuild and restoration, continued page availability and server-process survival. It passed on Windows in 42.6 seconds. A dedicated Windows CI job is configured to run it; no hosted CI result is claimed. Run this regression separately from other frontend build commands because it temporarily edits/restores the shared stylesheet.

A final native soak ran for **322 seconds**, completed **84 page visits** across seven routes at 320/768/1440 px, retained the same web-server PID and reported zero browser JavaScript errors. Each round checked API, database, Redis and worker readiness. Project containers were stopped during the independence check; native smoke passed with no Compose services running. All **52 automated tests** (the 51 application tests plus the new dev-server regression) passed on the updated native toolchain. This is measured regression coverage, not an unlimited-uptime guarantee.

## Verification boundaries

- Optional Shopify/Stripe accounts, OAuth and production infrastructure were not verified here.
- No production-load, long-duration scheduling, disaster-recovery or exhaustive penetration test was performed.
- No hosted CI run is claimed; the workflow configuration is provided.
- `npm audit` reflects the registry's advisory database at execution time, not an absolute security guarantee.
- The workstation's system Node remains 24.11.1; project npm scripts use the pinned 24.22.0 runtime. The startup check explicitly rejects the older system runtime when invoked directly. Install the version in .node-version before a fresh installation.

See [IMPLEMENTATION.md](IMPLEMENTATION.md) and [README.md](README.md) for application architecture and operating limits.
