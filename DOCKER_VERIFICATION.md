# Docker and backend verification

Verified on 21 October 2026 in Ubuntu 24.04 under WSL2. The running application is available at http://localhost:8080. Docker Engine runs inside WSL rather than Windows Docker Desktop.

## Running services

| Service                | Observed result                                           |
| ---------------------- | --------------------------------------------------------- |
| PostgreSQL 16.15       | Healthy; persistent database volume                       |
| Redis 7.4.11           | Healthy; AOF enabled and persistent volume                |
| Initialization         | Exited with code 0 after migration and deterministic seed |
| API                    | Healthy; Node 24.22.1, UID 1000                           |
| Worker                 | Healthy; heartbeat and real BullMQ jobs verified          |
| Nginx 1.28.3 / Angular | Healthy; SPA routing, API proxy and static logo verified  |

Docker Engine: **29.1.3**. Compose: **2.40.3**. API readiness returned HTTP 200 with `api`, `database`, `redis` and `worker` all true. Only `127.0.0.1:8080` is published; PostgreSQL/Redis coexist with native development services without exposing their container ports.

The final configuration uses one multi-stage Dockerfile. API and web share the workspace dependency stage; init and worker reuse the API image. A subsequent build confirmed that `npm ci` was cached. Dependency downloads now also use a BuildKit npm cache and retry transient registry failures. API and worker receive shutdown signals directly through Node and run as the unprivileged `node` user.

## Executed checks

| Check                                                                | Result                                                      |
| -------------------------------------------------------------------- | ----------------------------------------------------------- |
| Compose configuration validation                                     | Passed                                                      |
| `docker compose up --build -d --wait --wait-timeout 180`             | Passed                                                      |
| Linux API type check, Prisma generation and Angular production build | Passed                                                      |
| Domain/provider tests inside the API image                           | 16 passed                                                   |
| Integration tests against container PostgreSQL and Redis             | 18 passed in 11.14 seconds                                  |
| Angular component tests inside the image                             | 5 passed                                                    |
| Chrome browser suite against the built app on port 8080              | 12 passed in 55.1 seconds                                   |
| `npm run test:compose` through Nginx                                 | Passed                                                      |
| Full container recreation with existing volumes                      | Passed                                                      |
| Desktop/mobile screenshots and browser errors                        | Inspected; no JavaScript errors or 390 px document overflow |

These are **51 unique automated tests**, also passed in the native development environment, plus the Compose smoke checks. Expected synthetic provider failures in integration-test output exercise retry/failure handling; they are not failures of the running stack.

The smoke script verifies three persisted workspace identities, API permissions, a completed background synchronization without duplicated orders, an Analyst CSV import with one valid and one rejected row, and report creation/preview/export/deletion. Browser workflows cover all seven pages, keyboard controls, settings, schedules, sorting, report editing, session refresh and error recovery. Login is checked at 320, 390, 768, 1024 and 1440 px; the page matrix and editing flows cover desktop and mobile widths.

## Persistence check

Executed `docker compose down` without deleting volumes, then `docker compose up -d --wait --wait-timeout 180`. All services became healthy again and init exited successfully. Counts were identical before and after recreation:

| Persisted data                        | Before | After |
| ------------------------------------- | -----: | ----: |
| Orders                                |  4,209 | 4,209 |
| Payments                              |  4,209 | 4,209 |
| Campaign rows, including test uploads |  1,583 | 1,583 |
| Import batches                        |      2 |     2 |
| Saved reports                         |      1 |     1 |
| Workspace memberships                 |      3 |     3 |

Session counts also matched. Reseeding did not multiply records. A subsequent browser login and dashboard load succeeded after recreation.

## Role permissions

| Capability                                 | Admin | Analyst | Viewer |
| ------------------------------------------ | ----- | ------- | ------ |
| Dashboards, data and saved report previews | Yes   | Yes     | Yes    |
| CSV imports                                | Yes   | Yes     | No     |
| Create/edit/delete reports and export CSV  | Yes   | Yes     | No     |
| Manual synchronization and schedules       | Yes   | No      | No     |
| Workspace settings and team role changes   | Yes   | No      | No     |

Restrictions are enforced by the API as well as the UI. Selecting a workspace account changes the login identity and explains its permissions; it does not grant privileges in the browser.

## Reproduce

Run Compose commands from the project directory inside the Docker-enabled environment. On this workstation, use the WSL commands in README and keep a WSL terminal open.

```sh
docker compose config --quiet
docker compose up --build -d --wait --wait-timeout 180
docker compose ps -a
```

From PowerShell in the project directory:

```powershell
npm run test:compose
$env:PLAYWRIGHT_CHANNEL = 'chrome'
$env:PLAYWRIGHT_BASE_URL = 'http://localhost:8080'
npm run test:e2e
Remove-Item Env:PLAYWRIGHT_BASE_URL
```

For isolated integration tests, create `prism_test` once, migrate it, and use Redis database 1:

```sh
docker compose exec -T postgres createdb -U prism prism_test
docker compose run --rm --no-deps -e DATABASE_URL=postgresql://prism:prism_local@postgres:5432/prism_test api npm run db:migrate
docker compose run --rm --no-deps --user root -e TEST_DATABASE_URL=postgresql://prism:prism_local@postgres:5432/prism_test -e TEST_REDIS_URL=redis://redis:6379/1 api npm run test:integration
docker compose run --rm --no-deps --user root api sh -c "npm test && npm run test:web"
```

The test runners write temporary Vite configuration/cache files, so the disposable test containers override the user. The running API/worker retain UID 1000 and read-only application-file ownership. Do not point integration tests at the application database or Redis database 0.

## Review scope

Backend corrections include atomic refresh-token rotation, decoded Redis URL credentials, durable CSV deduplication/recovery, retention of synchronization claims after ambiguous queue acknowledgements, and graceful API shutdown. Integration regressions exercise concurrent refreshes/uploads, distinct role permissions and lost acknowledgements using real PostgreSQL/BullMQ processing.

Optional Shopify/Stripe accounts, production deployment, load/disaster-recovery testing, physical mobile devices and hosted CI remain outside this verification. See QUALITY_REVIEW.md for the broader source/layout review and remaining limits.
