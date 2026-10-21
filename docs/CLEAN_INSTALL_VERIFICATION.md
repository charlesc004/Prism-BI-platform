# Clean native installation verification

Verified on 21 October 2026 using the README's Windows/WSL native workflow. Docker commands and container services were not used to install, migrate, seed or run this copy.

## Installation and isolation

- Source checkout: `C:\Users\Ali\Documents\ChatGPT\Prism`.
- Clean copy: `C:\Users\Ali\Documents\ChatGPT\Prism-clean-20261021-170553`.
- Evidence and backup directory: `C:\Users\Ali\Documents\ChatGPT\Prism-clean-evidence-20261021-170553`.
- Node 24.22.0 was downloaded as an official standalone Windows archive and verified against the published SHA-256 checksum. Its bundled npm was 11.19.1; no global Node installation was replaced.
- Source files were copied without `.env`, `.git`, `node_modules`, Prisma output, frontend caches/builds or previous test results. The corrected source inventory contains 126 files; the actual provider source under `providers/generated` is included.
- `npm ci` used a separate, initially empty npm cache: 725 packages installed, 729 audited, zero reported vulnerabilities. Package deprecation/install-script notices remain in the log and did not prevent installation.
- Existing PostgreSQL 16 and Redis 7.0.15 executables were reused, with entirely new data directories and processes. This verifies a fresh application installation, not installation on a blank operating system.

| Component                 | Isolated target                                        |
| ------------------------- | ------------------------------------------------------ |
| Application PostgreSQL    | `127.0.0.1:55432`, database `prism`                    |
| Integration PostgreSQL    | Same new cluster, separate database `prism_test`       |
| PostgreSQL data directory | `/var/lib/postgresql/prism-clean-20261021-170553/data` |
| Application Redis         | `127.0.0.1:6380`, database 0                           |
| Integration Redis         | Same new Redis process, database 1                     |
| Redis data directory      | `/var/lib/redis/prism-clean-20261021-170553`           |
| Redis durability          | AOF enabled; `maxmemory-policy noeviction`             |
| API / frontend            | `http://localhost:3000` / `http://localhost:4400`      |

The new application database had zero public tables before migrations. Both versioned migrations applied successfully. Prisma generation and schema comparison passed, with no schema differences. The first successful seed created 4,209 orders, 4,209 payments, 1,580 campaign-spend rows, six sources, three members and one saved report. Repeating seed retained every table's row count.

The app then started through `npm run dev` before any production build had run. The frontend, API and real ingestion worker operated against the new services.

## Existing database preservation

The previous native application was stopped before the baseline snapshot, while its PostgreSQL server remained running. The new installer and application never used its database/Redis connection URLs.

A full `pg_dump` archive of the original `prism` database on port 5432 was saved as `existing-prism.dump` in the evidence directory. Its archive listing was validated. It was never restored into the new installation; new records came from seed.

Before/after read-only snapshots compared all **13 public tables** (12 application tables and migration history): row counts and full-row SHA-256 fingerprints, column definitions/defaults, indexes and constraints. The final comparison passed with no differences. The original 4,209 orders and 4,209 payments remained intact, as did all other rows and migration metadata. Original connection settings and service configurations were preserved; no existing database was dropped, reset, migrated or seeded.

`existing-database-before.json`, `existing-database-after.json`, the validated archive listing and individual command logs are retained in the evidence directory.

## Executed verification

| Check                                             | Result                                                                 |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| Fresh dependency installation                     | Passed, from an empty project dependency directory and empty npm cache |
| Official Node archive checksum                    | Passed                                                                 |
| Prisma generation and both migrations             | Passed against the new cluster                                         |
| First seed and repeat-seed row counts             | Passed                                                                 |
| Schema comparison                                 | No differences                                                         |
| Development startup before production build       | Passed                                                                 |
| Domain/provider tests                             | 16 passed                                                              |
| PostgreSQL/Redis integration tests                | 18 passed after correction; repeated suite also passed                 |
| Angular component tests                           | 5 passed                                                               |
| Chromium browser workflows                        | 12 passed, including mobile/tablet/desktop views and account roles     |
| Native dev-server regression                      | 1 passed: 30 browser disconnects and CSS update/restoration            |
| Total unique automated tests                      | **52 passed**                                                          |
| Native operational smoke                          | Passed before and after final startup                                  |
| Contracts/API checks and Angular production build | Passed                                                                 |
| ESLint / Prettier                                 | Passed                                                                 |
| Original database fingerprints and schema         | Unchanged                                                              |

The operational smoke exercised actual BullMQ synchronization, CSV persistence, report create/preview/export/delete and Admin/Analyst/Viewer restrictions. These tests intentionally modified only the new application/test databases and new Redis instance.

## Issue exposed and corrected

The first integration run exposed a real transaction boundary defect: a failed synchronization could expose `SyncRun.status = FAILED` before its source changed from `SYNCING` to `ERROR`.

`apps/api/src/jobs/failure.ts` now commits run failure, source status and import cleanup in one PostgreSQL transaction. Analytics invalidation follows the commit. The existing regression that caught the mismatch passed in two subsequent full integration runs. The correction was applied to both the source checkout and the verified copy; no schema migration was needed.

The initial copy procedure also incorrectly excluded the source folder `providers/generated`. That exclusion was corrected before the successful seed; it was an installation-harness mistake, not a missing project file. The guarded restart helper was corrected to avoid exporting a global `PORT`, which can also influence frontend tooling. The README now explicitly keeps the API port in `.env`.

## Current runtime status and restarting the isolated copy

**The original checkout is running again at port 4400.** Its API uses port 3000, its original PostgreSQL database uses port 5432 and Redis uses port 6379. The isolated application, PostgreSQL cluster on port 55432 and Redis on port 6380 have been stopped. All isolated files, records and verification evidence are retained; existing Docker services were not altered.

The original application is available at <http://localhost:4400>, with readiness at <http://localhost:4400/health/ready>. The failure-handler fix in the original checkout has the same SHA-256 fingerprint as the tested isolated copy. Read-only snapshots taken before and after resuming the original application confirmed that all 13 public tables, their complete row fingerprints and schema definitions still match the original baseline. No migration, seed or data reset was run during the switch.

To use the isolated copy again later, first stop the original launcher to free ports 3000 and 4400, then run:

```powershell
Set-Location 'C:\Users\Ali\Documents\ChatGPT\Prism-clean-20261021-170553'
& .\.local\Start-Clean.ps1
```

The helper verifies the dedicated PostgreSQL data directory and Redis PID, starts only those isolated services if stopped, keeps WSL active and runs the normal launcher. It refuses to launch over occupied application ports and performs no initialization, migration, seeding or data deletion. Retain the evidence directory because it contains this verification's standalone Node toolchain.

For integration checks against this copy, explicitly select its test services:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://prism:prism_local@127.0.0.1:55432/prism_test'
$env:TEST_REDIS_URL = 'redis://127.0.0.1:6380/1'
npm run test:integration
```

To return to the original native application, stop the clean launcher first, then run `npm run dev` from the original checkout with its original `.env` and native services. Do not copy the clean `.env` over the original one. Stopping a launcher does not delete either installation's records.

Hosted CI, external provider accounts, exhaustive security/load testing and unlimited uptime were not verified by this local installation test.
