# PRISM

**Business intelligence, beautifully connected.**

PRISM brings commerce, payments and marketing data into one business workspace. It combines a responsive Angular dashboard with a TypeScript API, PostgreSQL persistence and a background ingestion worker. Users can synchronize sources, inspect records and build reports from the same stored data.

Workspace initialization provisions **Northstar Goods**, role-based accounts and a generated dataset. Generated sources, CSV uploads and external provider adapters share the same authentication, ingestion, persistence and reporting services. Shopify and Stripe account-level verification remains outside the completed local testing.

## Contents

- [Product capabilities](#product-capabilities)
- [Screenshots](#screenshots)
- [Technology stack](#technology-stack)
- [Architecture](#architecture)
- [Repository structure](#repository-structure)
- [Quick start with Docker Compose](#quick-start-with-docker-compose)
- [Local development](#local-development)
  - [Choose your native setup](#choose-your-native-setup)
  - [Daily native startup, shutdown and updates](#daily-native-startup-shutdown-and-updates)
  - [Native stability checks and troubleshooting](#native-stability-checks-and-troubleshooting)
- [Build and runtime behavior](#build-and-runtime-behavior)
- [Configuration](#configuration)
- [Workspace accounts and permissions](#workspace-accounts-and-permissions)
- [Using the application](#using-the-application)
- [How synchronization works](#how-synchronization-works)
- [CSV imports and exports](#csv-imports-and-exports)
- [Database and data integrity](#database-and-data-integrity)
- [Analytics and metric definitions](#analytics-and-metric-definitions)
- [Provider integrations](#provider-integrations)
- [API reference](#api-reference)
- [Authentication and security](#authentication-and-security)
- [Operations and troubleshooting](#operations-and-troubleshooting)
- [Testing and verification](#testing-and-verification)
- [Development conventions](#development-conventions)
- [Scope and limitations](#scope-and-limitations)

## Product capabilities

| Area                 | What it provides                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Overview             | Revenue, orders, average order value, refunds, campaign spend, period comparisons, channel breakdowns and source freshness         |
| Analytics            | Six charts for revenue, orders, payments, refunds, campaign spend and revenue/spend comparison; day/week/month grouping            |
| Data sources         | Labeled generated/live connections, source details, manual synchronization, recurring schedules and CSV uploads                    |
| Synchronization      | Service readiness, persisted job history, progress counters, retries and failure details                                           |
| Data explorer        | Orders, payments and campaign datasets with server-side filters, search, stable sorting, pagination, record details and CSV export |
| Reports              | Saved definitions, configuration editing, preview charts, metric descriptions and CSV exports                                      |
| Team & Settings      | Workspace name, reporting timezone, canonical revenue provider, existing-member roles and audit records                            |
| Access control       | Admin, Analyst and Viewer permissions enforced by the API and reflected in the interface                                           |
| Responsive interface | Desktop navigation, mobile drawer, keyboard-accessible dialogs, shared typography and reusable chart/table components              |

Financial aggregates are calculated on the server. Charts use API responses derived from PostgreSQL; the browser does not contain authoritative financial calculations or hardcoded chart datasets.

## Screenshots

Six key views captured from the running Docker application. Click an image to view it at full resolution.

| Overview                                                                                                                       | Analytics                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| [![Overview dashboard with business metrics and revenue charts](docs/screenshots/overview.png)](docs/screenshots/overview.png) | [![Analytics with revenue, orders, payments and campaign trends](docs/screenshots/analytics.png)](docs/screenshots/analytics.png) |

| Data sources                                                                                                       | Synchronization                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| [![Data source connections and CSV imports](docs/screenshots/data-sources.png)](docs/screenshots/data-sources.png) | [![Service readiness and synchronization job history](docs/screenshots/synchronization.png)](docs/screenshots/synchronization.png) |

| Data explorer                                                                                                                                | Reports                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| [![Data explorer with filters, sorting and persisted order records](docs/screenshots/data-explorer.png)](docs/screenshots/data-explorer.png) | [![Saved report configuration and revenue preview](docs/screenshots/reports.png)](docs/screenshots/reports.png) |

## Technology stack

| Layer                  | Technology                                               | Responsibility                                                                      |
| ---------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Language and workspace | TypeScript 6, npm workspaces, ES modules                 | Strict shared types and coordinated application/tooling commands                    |
| Frontend               | Angular 22, Angular Router, Signals, OnPush              | Standalone components, lazy-loaded routes and explicit UI state                     |
| Forms and HTTP         | Reactive Forms, HttpClient, RxJS                         | Validated forms, API requests, debounced search and shared authentication refresh   |
| Presentation           | Tailwind CSS 4, application CSS, Chart.js 4, Angular CDK | Theme, responsive layout, reusable charts and dialog focus management               |
| API                    | Node.js 24, Express 5, Zod 4                             | HTTP routing, request validation, authentication and business-service orchestration |
| Persistence            | PostgreSQL 16, Prisma 7, PostgreSQL driver adapter       | Relational storage, migrations, transactions and typed database access              |
| Background processing  | Redis 7, BullMQ 5, ioredis                               | Queues, retries, schedules, worker heartbeat and aggregate caching                  |
| Authentication         | Argon2, opaque session tokens, cookies                   | Password verification and server-side session management                            |
| Parsing and dates      | csv-parse, Luxon                                         | Campaign CSV parsing and IANA timezone/calendar calculations                        |
| Packaging              | Docker Compose, multi-stage Dockerfile, Nginx            | Service orchestration, shared dependency build and SPA/API serving                  |
| Quality tooling        | ESLint, Prettier, Vitest, Supertest, Playwright          | Static checks, unit/component/integration tests and browser workflows               |

Major versions describe the selected stack. `package-lock.json` records resolved dependency versions; use `npm ci` to install that dependency tree.

## Architecture

PRISM is an npm-workspace monorepo with a modular API and a separate worker process. The API owns the HTTP boundary, domain services own processing and calculations, and provider adapters translate external responses into one normalized record contract.

```mermaid
flowchart LR
    Browser[Angular application] --> Web[Nginx / development proxy]
    Web --> API[Express API]
    API --> DB[(PostgreSQL)]
    API --> Redis[(Redis: queue and cache)]
    Redis --> Worker[BullMQ worker]
    Worker --> Providers[Generated / Shopify / Stripe providers]
    Worker --> DB
    Worker --> Redis
    Contracts[Shared TypeScript and Zod contracts] -.-> Browser
    Contracts -.-> API
```

### Request and rendering flow

1. Angular loads the authenticated identity and workspace settings.
2. A page sends filters or record queries through the shared API service.
3. Express authenticates the session, checks the role and validates input.
4. The relevant service reads workspace-scoped records or cached aggregates.
5. Shared response contracts feed metric cards, tables and Chart.js components.

Changing a reporting filter starts a new request. Dashboard, explorer, analytics and report-preview state handle superseded responses so older data cannot replace the latest requested view. A shared workspace service updates navigation and overview after settings changes.

### Separation of responsibilities

- **Frontend:** navigation, forms, interaction state, formatting and visualization.
- **HTTP routers:** validation, role checks, response codes and audit orchestration.
- **Domain services:** analytics, synchronization claims, imports, exploration and exports.
- **Providers:** transport, pagination and normalization; independent of Express and Prisma.
- **Persistence:** transactions, ownership, uniqueness and database queries.
- **Worker:** asynchronous execution, retries, recovery and heartbeat updates.
- **Shared contracts:** DTOs, report/filter schemas, roles and metric definitions.

## Repository structure

```text
Prism/
├── apps/
│   ├── api/
│   │   ├── prisma/
│   │   │   ├── schema.prisma       # Relational models and indexes
│   │   │   ├── migrations/         # Versioned SQL migration
│   │   │   └── seed.ts             # Workspace, accounts and generated records
│   │   ├── src/
│   │   │   ├── config/             # Environment validation, Prisma and Redis
│   │   │   ├── http/               # Focused route modules
│   │   │   ├── modules/            # Auth, analytics, ingestion, sync and exports
│   │   │   ├── providers/          # Contracts, registry, generated/live adapters, CSV
│   │   │   ├── jobs/               # Queue, processor, worker and retry handling
│   │   │   ├── shared/             # Errors, audit and dependency health
│   │   │   ├── generated/          # Generated Prisma client; not committed
│   │   │   ├── app.ts              # Express middleware and router setup
│   │   │   ├── routes.ts           # Authentication boundary and composition
│   │   │   ├── openapi.ts          # OpenAPI endpoint catalog
│   │   │   └── server.ts           # HTTP startup and graceful shutdown
│   │   └── tests/                  # Domain/provider and integration tests
│   └── web/
│       ├── public/                 # Shared brand SVG and static assets
│       ├── src/app/
│       │   ├── core/               # Auth, guard, interceptor and API services
│       │   ├── layouts/            # Application shell and navigation
│       │   ├── shared/             # Charts, metric cards, tables, icons, filters
│       │   └── features/           # Login and seven workspace pages
│       ├── src/styles.css          # Theme, typography and responsive styles
│       └── tests/                  # Angular component tests
├── packages/contracts/             # Shared DTOs, Zod schemas and metrics
├── fixtures/                       # Generated data, HTTP fixtures and CSV samples
├── infrastructure/                 # Dockerfile, Nginx and worker health check
├── tests/e2e/                      # Playwright browser workflows
├── tests/tooling/                  # Native dev-server stability regression
├── scripts/                        # Runtime validation and native/Compose smoke checks
├── docs/screenshots/               # Six application screenshots
├── .github/workflows/ci.yml        # CI checks
├── .node-version                   # Tested Node runtime
├── .env.example                    # Local configuration template
├── docker-compose.yml              # Application services, including one-shot init
├── package.json                    # Workspace scripts
└── package-lock.json               # Resolved dependency tree
```

## Quick start with Docker Compose

### Requirements

- Docker Engine or Docker Desktop with the Compose v2 plugin.
- Access to image/package registries for the initial build.
- Host port **8080** available.

Host Node.js, PostgreSQL and Redis are not required to start Compose. Host Node/npm are needed only if you also run host-side test scripts.

From the repository root:

```sh
docker compose config --quiet
docker compose up --build -d --wait --wait-timeout 180
docker compose ps -a
```

Open **[http://localhost:8080](http://localhost:8080)** and use a [workspace account](#workspace-accounts-and-permissions). Compose supplies development defaults; an `.env` file is optional for this startup path.

### What Compose starts

| Service    | Purpose                                                      | Startup condition                                                 |
| ---------- | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| `postgres` | Database with a persistent named volume                      | PostgreSQL readiness                                              |
| `redis`    | Queue, schedules and cache; AOF persistence and `noeviction` | Redis ping                                                        |
| `init`     | Apply migrations and initialize the workspace                | Runs after database/Redis readiness; expected to exit with code 0 |
| `api`      | Express HTTP service                                         | Starts after init; readiness includes database, Redis and worker  |
| `worker`   | BullMQ ingestion and recovery                                | Starts after init; heartbeat health check                         |
| `web`      | Nginx serving Angular and proxying API calls                 | Starts after API readiness                                        |

Only `127.0.0.1:8080` is published. Container database, Redis and API ports remain on the Compose network. Native services on ports 5432, 6379 and 3000 can coexist.

The initial build can take several minutes on a slow connection. API and web share a dependency-install stage; init and worker reuse the API image.

### Useful lifecycle commands

```sh
# Follow runtime logs.
docker compose logs -f api worker web

# Check readiness through the browser's proxy.
curl http://localhost:8080/health/ready

# Restart the worker, including pending-work recovery.
docker compose restart worker

# Remove containers/network while preserving named volumes.
docker compose down

# Recreate the stack with persisted data.
docker compose up -d --wait --wait-timeout 180
```

`docker compose down` preserves volumes. Adding `-v` deletes their data; it is not required for routine restarts or rebuilds.

### Windows with a WSL-hosted engine

Workstation verification used Docker Engine inside `Ubuntu-24.04` WSL2. For that setup, start the daemon from PowerShell:

```powershell
wsl -d Ubuntu-24.04 -u root -- service docker start
wsl -d Ubuntu-24.04 -u root
```

In WSL, change to your checkout, for example `/mnt/c/path/to/Prism`, and run Compose. Keep a WSL terminal open while using that engine. With Docker Desktop, use its normal terminal integration instead.

## Local development

This path runs the Angular web server, Node API and worker **without Docker**. PostgreSQL and Redis must be installed separately. Run repository commands from the directory containing the root `package.json`.

### Choose your native setup

| Setup                                        | Where Node and repository commands run                 | Where PostgreSQL and Redis run                  |
| -------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------- |
| Windows + WSL2, verified on this workstation | Windows PowerShell; checkout on the Windows filesystem | Ubuntu 24.04 in WSL2, reached through localhost |
| Ubuntu 24.04                                 | Ubuntu terminal; checkout on the Linux filesystem      | Native Ubuntu services                          |

Use one environment for a checkout's `node_modules`. If you switch between Windows Node and Linux Node, stop PRISM and run `npm ci` in the new environment before continuing; native packages differ by platform. Docker Desktop and the Docker daemon are not dependencies of either native setup.

### Step 1: Install the pinned Node runtime

Install **Node.js 24.22.0 LTS** and its bundled npm in the environment where you will run PRISM. The tested version is recorded in [`.node-version`](.node-version) and pinned in `package.json` / `package-lock.json`. Obtain the matching Windows installer or Linux distribution from the [official Node.js release archive](https://nodejs.org/dist/v24.22.0/). On Windows, reopen PowerShell after installation so its PATH is refreshed.

Check the runtime before installing dependencies:

```sh
node --version
npm --version
```

`node --version` should report `v24.22.0` for the documented setup. Current package engines also allow later Node 24.22+ patches/minors and Node 26+, but the recorded native verification used 24.22.0. The project-local runtime installed by `npm ci` supplies that exact version to npm scripts. A compatible system Node is still needed for installation without engine warnings.

If PowerShell blocks `npm.ps1`, use `npm.cmd` for the npm commands in this guide. No global Angular CLI, Prisma installation or execution-policy change is needed.

### Step 2: Install and start PostgreSQL and Redis

PRISM uses PostgreSQL **16** and Redis **7** in the verified native setup. Default host ports are **5432** and **6379**; API and frontend ports are **3000** and **4400**.

**Windows:** if WSL2 and Ubuntu 24.04 are not installed, run the following once in an administrator PowerShell, then restart Windows if requested. Follow the first-launch prompts to create your Ubuntu user. Microsoft's [WSL installation guide](https://learn.microsoft.com/en-us/windows/wsl/install) covers prerequisites and installation options.

```powershell
wsl --install -d Ubuntu-24.04
```

Open Ubuntu from PowerShell:

```powershell
wsl --list --verbose
wsl -d Ubuntu-24.04
```

**Inside Ubuntu 24.04, including WSL:** install the database and queue service. These commands are for the Ubuntu terminal, not PowerShell. PostgreSQL provides [Ubuntu package guidance](https://www.postgresql.org/download/linux/ubuntu/); Redis provides [Linux installation guidance](https://redis.io/docs/latest/operate/oss_and_stack/install/archive/install-redis/install-redis-on-linux/).

```sh
sudo apt-get update
sudo apt-get install -y postgresql-16 postgresql-client-16 redis-server
sudo service postgresql start
sudo service redis-server start
pg_isready -h 127.0.0.1 -p 5432
redis-cli ping
```

Expected results are `accepting connections` and `PONG`. If the packages or service names differ on another Linux distribution, use that distribution's service manager and install the required versions before proceeding.

For durable queued jobs across service or machine restarts, review the native Redis configuration. BullMQ expects `maxmemory-policy noeviction`; Redis persistence is an operating-service setting and is not automatically enabled by `npm run dev`. To enable append-only persistence on Ubuntu, stop PRISM first, edit the existing `/etc/redis/redis.conf` with `sudoedit`, set `appendonly yes` and `maxmemory-policy noeviction`, then restart and verify Redis:

```sh
sudo service redis-server restart
redis-cli CONFIG GET appendonly maxmemory-policy
redis-cli ping
```

Keep local database/Redis services bound to loopback. These connection settings are for the local workspace; optional provider credentials are configured separately.

**Keep WSL active:** services can disappear when the distribution becomes idle. After installation, use a dedicated PowerShell window to start the services and keep the distribution active for the entire PRISM session:

```powershell
wsl -d Ubuntu-24.04 -u root -- bash -lc 'service postgresql start && service redis-server start && exec sleep infinity'
```

Leave that window open. Run Node/npm in a **second Windows PowerShell**, not in the waiting WSL terminal. The command starts PostgreSQL/Redis only; it does not start Docker. On a native Ubuntu installation, keep the services running through the system service manager instead.

### Step 3: Provision the application database once

In the Ubuntu terminal, open PostgreSQL as its administrator:

```sh
sudo -u postgres psql -v ON_ERROR_STOP=1
```

For a **fresh installation**, enter:

```sql
CREATE ROLE prism WITH LOGIN PASSWORD 'prism_local';
CREATE DATABASE prism OWNER prism;
```

Exit `psql` with `\q`. If the role/database already exists, preserve it and check its owner/password instead of repeating the creation commands. These credentials match `.env.example` and are local development defaults.

Verify a real authenticated TCP connection; enter `prism_local` when prompted:

```sh
psql -h 127.0.0.1 -U prism -d prism -W -c 'SELECT current_database(), current_user;'
```

The result should identify database `prism` and user `prism`. `pg_isready` alone does not validate application credentials. A separate `prism_test` database is needed only for [integration tests](#integration-tests-with-native-services).

On Windows, confirm that the native service ports are reachable from PowerShell before starting Node:

```powershell
Test-NetConnection 127.0.0.1 -Port 5432
Test-NetConnection 127.0.0.1 -Port 6379
```

Both should show `TcpTestSucceeded: True`. The default Compose database/Redis services do not publish these ports; starting Compose does not replace native provisioning.

### Step 4: Install the workspace and configure the environment

Open your checkout in the Node environment selected in step 1. In Windows PowerShell, for example:

```powershell
Set-Location 'C:\path\to\Prism'
npm ci
if (!(Test-Path -LiteralPath '.env')) {
    Copy-Item -LiteralPath '.env.example' -Destination '.env'
}
```

In an Ubuntu terminal, use your actual checkout path:

```sh
cd /path/to/Prism
npm ci
test -f .env || cp .env.example .env
```

The copy commands preserve an existing configuration. Edit the **root** `.env` to match your native services. Its core local settings are:

```dotenv
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://prism:prism_local@127.0.0.1:5432/prism
REDIS_URL=redis://127.0.0.1:6379
WEB_ORIGIN=http://localhost:4400
SEED_REFERENCE_DATE=2026-10-20
SEED_PASSWORD=PrismAccess2026!
```

Keep `NODE_ENV=development` for this HTTP development path; production mode enables secure cookies and refuses seeding. Open the frontend using **`http://localhost:4400`**, matching `WEB_ORIGIN` exactly. Switching to `127.0.0.1`, another port or HTTPS changes the browser origin. The Angular proxy targets API port 3000 in `apps/web/proxy.conf.json`; changing `PORT` also requires updating that proxy target.

`SEED_PASSWORD` must contain at least 12 characters. Enter your configured password on the login screen if you replace the template value. `SEED_REFERENCE_DATE` determines the generated data's reporting period; select that period in the dashboard if it falls outside the default date filter. Optional Shopify/Stripe values may remain empty for local setup.

OS environment variables take precedence over `.env`. Remove stale shell overrides such as `DATABASE_URL`, `NODE_ENV`, `PORT` or `WEB_ORIGIN` if an earlier test/export set them. Set the API's `PORT` in the root `.env` rather than exporting it to the combined launcher: a global `PORT` can also influence frontend tooling. Restart API and worker after changing their configuration.

### Step 5: Generate the client, apply migrations and initialize data

Run these commands **in order** from the repository root. Check each result before proceeding:

```sh
npm run db:generate
npm run db:migrate
npm run db:seed
```

| Command       | Expected effect                                                                                             |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| `db:generate` | Creates the Prisma client under `apps/api/src/generated/prisma`                                             |
| `db:migrate`  | Applies versioned SQL through `prisma migrate deploy`; an up-to-date database reports no pending migrations |
| `db:seed`     | Initializes the workspace, three account roles, source connections, generated records and initial report    |

Seeding requires `SEED_PASSWORD` and refuses production mode. It updates matching initialized records and preserves existing account passwords and membership roles. Changing `SEED_PASSWORD` does not rotate an existing account's password. Seeding is an initialization/update operation, not a daily startup or database reset.

Existing databases should be backed up before an upgrade. Routine setup does not require dropping a database, resetting migrations or manually changing migration checksums. Investigate a failed migration before starting the application.

### Step 6: Start API, frontend and worker together

```sh
npm run dev
```

Keep this terminal open. Startup validates the Node version, then starts all three processes. Expected messages include:

```text
PRISM API listening on 3000
PRISM worker ready
Local: http://127.0.0.1:4400/
```

Angular may print a `127.0.0.1` listen URL; use **[http://localhost:4400](http://localhost:4400)** in the browser to match the configured authentication origin. Wait for Angular's build and dependency optimization to finish. Sign in with a [workspace account](#workspace-accounts-and-permissions).

The frontend proxies `/api` and `/health` to the API. The worker must remain running for synchronization, CSV ingestion and a healthy readiness response. If one launcher command exits, `concurrently --kill-others` stops its siblings so a terminated web server does not leave an apparently healthy partial session. Read the first failure in the combined log, correct it and restart the launcher.

For separate terminals during debugging, the equivalent commands are:

```sh
# Terminal 1: API
npm run dev -w @prism/api

# Terminal 2: Angular
npm run dev -w @prism/web

# Terminal 3: worker
npm run worker
```

With separate terminals, manage all three processes yourself. API watch mode may remain open after a startup error while waiting for a file change; an open terminal is not proof of readiness.

### Step 7: Verify the running native application

In another PowerShell window:

```powershell
Invoke-RestMethod 'http://localhost:4400/health/ready' | Format-List
```

Or in a POSIX shell:

```sh
curl --fail --silent --show-error http://localhost:4400/health/ready
```

The response must have `api`, `database`, `redis` and `worker` all `true`, with a recent `heartbeat`. HTTP 503 indicates that at least one dependency is unavailable; inspect the API/worker log and native service status before continuing.

Run the end-to-end operational check against port 4400:

```sh
npm run test:native
```

This exercises three account roles, real queue synchronization, CSV ingestion and saved-report creation/preview/export/deletion. It acts on the local workspace: successful imports remain stored, repeated fixture submissions are deduplicated and temporary smoke reports are deleted. It is not a read-only health probe.

The smoke runner uses the template account password unless `SEED_PASSWORD` is exported in its shell; unlike the API, it does **not** load `.env`. If you use a different initialized account password, supply it to the smoke command. PowerShell:

```powershell
$env:SEED_PASSWORD = 'your-configured-account-password'
try {
    npm run test:native
} finally {
    Remove-Item Env:SEED_PASSWORD
}
```

POSIX shell:

```sh
SEED_PASSWORD='your-configured-account-password' npm run test:native
```

Use the actual account password, including an existing password retained from an earlier seed. `npm run test:compose` uses the same smoke runner with port 8080 as its default. `PRISM_BASE_URL` can override either target; remove an old override before testing native development.

### Daily native startup, shutdown and updates

After the first installation, daily startup consists of:

1. Start/keep PostgreSQL and Redis active; on Windows, leave the WSL service window open.
2. Open the repository in the same Node environment, then run `npm run dev`.
3. Check `/health/ready` and open `http://localhost:4400`.

Stop PRISM with **Ctrl+C in its launcher terminal**. With separate-process debugging, stop each application terminal. Stop the application before closing its WSL service window or restarting PostgreSQL/Redis. Routine restarts preserve database records and do not need `npm ci`, migrations or seeding.

After pulling source changes, stop the application and run `npm ci` when dependencies/lockfile change, `npm run db:generate` when the Prisma client needs updating, and `npm run db:migrate` when migrations are added. Read the change's data-initialization requirements before running seed again. Restart and verify readiness. `npm ci` replaces installed packages; do not run it over an active Node application on Windows.

### Native stability checks and troubleshooting

The project pins Node 24.22.0, checks supported versions at root/web startup, uses normal Angular dependency prebundling and coordinates process shutdown. The previous temporary cache/worker/prebundling overrides are not part of the required setup. Do not work around a recurrence by adding automatic restart loops or disabling validation; preserve the first error and check the runtime/service state.

| Symptom                                                              | Native setup action                                                                                                                                                                                                     |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PRISM requires Node...`, `EBADENGINE`, or an older `node --version` | Install the version in `.node-version`, reopen the terminal, and run `npm ci` after stopping PRISM. `npm exec -- node --version` checks the project-local runtime.                                                      |
| Windows process exits with `0xC0000409`                              | Verify that the project runtime is 24.22.0, reinstall from the lockfile while stopped, then run the dev-server regression below. Keep the first log if it recurs; the exit code alone does not identify a native stack. |
| Database/Redis connection refused                                    | Start native services, keep WSL active and check ports 5432/6379. Use loopback URLs rather than Compose hostnames `postgres` or `redis`.                                                                                |
| Database authentication or ownership error                           | Test the same role/database with `psql -h 127.0.0.1 ...`; verify the database owner and `.env` password. URL-encode special characters in connection URLs.                                                              |
| HTTP 403 / `Origin not allowed` on login                             | Use `http://localhost:4400` and matching `WEB_ORIGIN`; clear an old shell override and restart API/worker.                                                                                                              |
| Login stops working over local HTTP                                  | Confirm `NODE_ENV=development`; secure production cookies require HTTPS.                                                                                                                                                |
| Readiness 503 or queued jobs do not progress                         | Check the four readiness fields and the worker terminal. Start the worker against the same database/Redis as the API.                                                                                                   |
| `EADDRINUSE` or a different Angular port is offered                  | Identify the process using 3000/4400 and stop the intended old PRISM session; retain the documented ports/origin.                                                                                                       |
| Prisma generated imports are missing                                 | Run `npm run db:generate` before startup or build.                                                                                                                                                                      |
| Operational/browser tests return 401 or 429                          | Supply the actual seeded account password; allow the login/request rate-limit window to reset between bulk runs.                                                                                                        |

For an isolated regression of the Angular server, stop other frontend build/test commands, install the browser once and run:

```sh
npx playwright install chromium
npm run test:dev-server
```

This test needs neither Docker nor PostgreSQL/Redis. It starts a separate dev server, disconnects 30 browser contexts at mobile/tablet/desktop sizes, changes/restores CSS through the live watcher and checks continued availability. The shared stylesheet is restored in cleanup. Use `PLAYWRIGHT_CHANNEL=chrome` or `msedge` if intentionally testing an installed browser instead of Playwright's Chromium.

The recorded native verification passed **52 automated tests**, a **322-second** continuous run with **84 page visits** and unchanged server PID, and a functional smoke run with every project container stopped. Build, lint and formatting also passed. The Windows CI regression is configured; these local results do not imply a completed hosted CI run or unlimited uptime. See [QUALITY_REVIEW.md](QUALITY_REVIEW.md) for diagnostic evidence and [testing and verification](#testing-and-verification) for the full suites.

## Build and runtime behavior

```sh
npm run db:generate
npm run build
```

The root build checks shared contracts, checks API TypeScript and creates the Angular production bundle under `apps/web/dist/browser`.

API and contracts builds use `tsc --noEmit`: they validate types rather than generating a separate JavaScript server distribution. API startup executes TypeScript through `tsx`. For a configured local environment, `npm run start -w @prism/api` starts the API without watch mode; the worker remains separate.

The shared Dockerfile contains four stages:

1. `workspace`: Node, OpenSSL, manifests, dependency installation and source files.
2. `api`: Prisma client generation and API type checking, then execution as the unprivileged `node` user.
3. `web-build`: Angular production compilation using the workspace stage.
4. `web`: Nginx with compiled browser assets and proxy configuration.

API and worker use Node entry points directly in containers so shutdown signals reach application handlers. API shutdown drains requests before closing dependencies; the worker waits for active work within the configured shutdown grace period.

## Configuration

Application environment is validated in `apps/api/src/config/env.ts`. Native execution reads the root `.env`; Compose injects container connection URLs and reads the documented seed/provider substitutions.

| Variable              | Native example/default                                | Purpose                                                                      |
| --------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| `NODE_ENV`            | `development`                                         | Runtime mode; production enables secure cookies and disables seeding         |
| `PORT`                | `3000`                                                | API port                                                                     |
| `DATABASE_URL`        | `postgresql://prism:prism_local@127.0.0.1:5432/prism` | PostgreSQL connection; Compose supplies hostname `postgres`                  |
| `REDIS_URL`           | `redis://127.0.0.1:6379`                              | Redis connection; Compose supplies hostname `redis`; `rediss://` enables TLS |
| `WEB_ORIGIN`          | `http://localhost:4400`                               | Allowed frontend origin; Compose uses `http://localhost:8080`                |
| `SEED_REFERENCE_DATE` | `2026-10-20` in template/Compose                      | Dataset end date; native validation defaults to today's UTC date when absent |
| `SEED_PASSWORD`       | `PrismAccess2026!` in examples                        | Explicit seed password, at least 12 characters                               |
| `SHOPIFY_DOMAIN`      | Empty                                                 | Optional `*.myshopify.com` domain                                            |
| `SHOPIFY_TOKEN`       | Empty                                                 | Optional server-side read token                                              |
| `SHOPIFY_API_VERSION` | `2026-10`                                             | Explicit adapter API version                                                 |
| `STRIPE_SECRET_KEY`   | Empty                                                 | Optional `sk_test_` key; live-money keys are rejected                        |

Changing connection URLs, `PORT` or `WEB_ORIGIN` in `.env` does not override explicit service environment values in `docker-compose.yml`. Update Compose deliberately when changing its network topology or public origin.

### Generated data and reporting dates

`fixtures/generated-data.json` configures 395 days of deterministic data. The initial baseline contains **4,209 orders**, **4,209 payments** and **1,580 campaign records**, before CSV uploads.

The reference date fixes the generated window. When running at a later date, select a reporting period inside that window or change the reference date and reseed. Existing rows are retained when the window changes. The seed also creates historical success/failure records for synchronization history.

### Test-specific configuration

| Variable              | Purpose                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `TEST_DATABASE_URL`   | Isolated integration database; defaults to local `prism_test`                            |
| `TEST_REDIS_URL`      | Isolated Redis; defaults to local database **1**                                         |
| `PLAYWRIGHT_BASE_URL` | Already running app, such as `http://localhost:8080`; disables automatic API/web startup |
| `PLAYWRIGHT_CHANNEL`  | Installed browser channel, such as `chrome`, instead of bundled Chromium                 |
| `PRISM_BASE_URL`      | Compose smoke target; defaults to `http://localhost:8080` and requires a local host      |

## Workspace accounts and permissions

With the default development seed password:

| Role    | Email                 | Password           |
| ------- | --------------------- | ------------------ |
| Admin   | `admin@prism.local`   | `PrismAccess2026!` |
| Analyst | `analyst@prism.local` | `PrismAccess2026!` |
| Viewer  | `viewer@prism.local`  | `PrismAccess2026!` |

Login shortcuts select an actual account and describe its role. If you seed with a custom password, enter it manually. Changing `SEED_PASSWORD` later does not overwrite existing passwords.

| Capability                                                  | Admin | Analyst | Viewer |
| ----------------------------------------------------------- | ----- | ------- | ------ |
| Dashboards, analytics, source status and record exploration | Yes   | Yes     | Yes    |
| Saved report viewing and preview                            | Yes   | Yes     | Yes    |
| CSV import                                                  | Yes   | Yes     | No     |
| Report creation, editing and deletion                       | Yes   | Yes     | No     |
| Record/report CSV export                                    | Yes   | Yes     | No     |
| Manual synchronization and recurring schedules              | Yes   | No      | No     |
| Workspace settings changes                                  | Yes   | No      | No     |
| Team role changes and audit history                         | Yes   | No      | No     |

The API derives the workspace from authenticated membership and checks permissions for each protected operation. A client-provided role/workspace does not grant access. Admins can change existing members' roles, but cannot change their own role through settings.

## Using the application

| Page            | Route              | Suggested workflow                                                                 |
| --------------- | ------------------ | ---------------------------------------------------------------------------------- |
| Login           | `/login`           | Select a workspace account and sign in                                             |
| Overview        | `/overview`        | Inspect headline metrics, comparisons, trends, channels and freshness              |
| Analytics       | `/analytics`       | Change reporting period/grouping and compare detailed charts                       |
| Data Sources    | `/data-sources`    | Inspect details, start an Admin sync, set off/hourly/daily schedules or upload CSV |
| Synchronization | `/synchronization` | Follow jobs/counters and persisted failures; history polls every three seconds     |
| Data Explorer   | `/data-explorer`   | Switch datasets, filter/search, sort IDs/event dates, inspect rows and export      |
| Reports         | `/reports`         | Select/create a report, choose metric/group/date/source, preview, save and export  |
| Team & Settings | `/settings`        | Configure reporting, inspect members and review audit records according to role    |

Try synchronizing Shopify Store twice: matching external IDs are updated rather than duplicated. Then upload `fixtures/campaign-spend/valid.csv`, inspect the import summary and create a revenue report. The invalid fixture shows rejection; mixed-validity files retain valid records and identify rejected row numbers.

Report previews can reflect unsaved form changes. Export uses the saved definition, so changed configuration must be saved first. Reports are workspace-shared: ownership is recorded, while Admin/Analyst roles permit changes to workspace reports.

## How synchronization works

### From request to persisted records

1. An Admin requests synchronization for a workspace-owned source.
2. A database transaction verifies the source, atomically claims it as `SYNCING`, creates a `SyncRun` and records an audit event.
3. The API adds a BullMQ job using the persisted run ID as its stable job ID.
4. A separate worker resolves the provider from source mode/type and fetches normalized pages.
5. Each page is validated and committed transactionally with processed/created/updated counters.
6. Committed pages invalidate workspace analytics caches.
7. After the complete scan succeeds, the worker advances the checkpoint, records last success and marks source/run ready/completed.
8. The UI reads persisted status and counters through the API.

### Reliability and recovery

- Source/external-ID uniqueness makes replayed pages safe. Existing records are updated, including later financial-state changes.
- Counters describe processing work, including replayed/updated rows; they do not describe new business records alone.
- A source claim prevents overlapping full scans for that source.
- Checkpoints advance only after the complete scan; page commits survive a later failure.
- Jobs have up to **three attempts** with exponential backoff and jitter. Runs persist retry/final failure states before propagating errors.
- BullMQ recovers stalled work. Worker startup reconciles pending database runs/imports missing their queue jobs.
- An enqueue acknowledgement can be lost after Redis accepted a job. Pending syncs retain the run and source claim to prevent overlap. Restore Redis and restart the worker to recover missing jobs.
- Hourly/daily schedules are stored through BullMQ schedulers. An overlapping scheduled scan is skipped.

Run states include `QUEUED`, `RUNNING`, `RETRY_SCHEDULED`, `COMPLETED` and `FAILED`. Source state is separate: `READY`, `SYNCING`, `ERROR` or `NOT_CONFIGURED`.

The included deployment uses one worker process with concurrency 2. Startup reconciliation is designed around that deployment; broader distributed-worker operation requires operational review.

## CSV imports and exports

### Input format

Campaign uploads require a `.csv` filename and these headers:

```csv
date,campaign,channel,spend,clicks,impressions,currency
2026-10-19,Autumn Launch,Google Ads,120.50,340,12500,USD
2026-10-20,Autumn Launch,Meta Ads,89.75,210,8400,USD
```

`currency` is optional; if provided, it must be `USD`. Dates use `YYYY-MM-DD`. Spend must be non-negative with at most two decimal places. Clicks/impressions require non-negative integers; blank counts are rejected. Required headers must exist; duplicate header names are rejected.

### Processing rules

- Maximum size: **2 MB**; maximum rows: **10,000**.
- UTF-8 BOMs and empty lines are handled by the parser.
- Row identity derives from date, campaign and channel. Duplicate identities within a file produce row errors; the same identity in a later changed file updates the stored record.
- A workspace/file-content SHA-256 fingerprint identifies duplicate uploads.
- At least one valid row is required. Mixed-validity uploads finish as `PARTIAL`; fully valid data finishes as `COMPLETED`.
- Summaries expose accepted/rejected counts and row errors, with row numbers including the header offset.
- Queue failures retain the pending payload in the database. Retrying the same file resumes that batch safely.
- Completed/finally failed processing clears the payload; import status and validation details remain.

Uploads augment generated campaign spend. Use independent datasets or explicit source filters when comparing data that may overlap.

### Exports

Explorer export uses active filters and is limited to **10,000 rows**. Report export uses the saved metric, grouping, dates and source. Money is exported in integer cents; report series include unit/context information.

CSV cells are quoted/escaped, and dangerous spreadsheet formula prefixes are neutralized. Exports create audit records and require Admin or Analyst access.

## Database and data integrity

| Model                         | Stored responsibility                                                  |
| ----------------------------- | ---------------------------------------------------------------------- |
| `Workspace`                   | Business identity, timezone, currency and canonical revenue provider   |
| `User`, `WorkspaceMembership` | Account identity, active status and workspace role                     |
| `Session`                     | Hashed access/refresh tokens, CSRF token and expiration times          |
| `DataSourceConnection`        | Provider, mode, state, checkpoint and last successful synchronization  |
| `SyncRun`                     | Timestamps, attempts, counters and errors                              |
| `CommerceOrder`               | Order identity, event date, status and integer financial amounts       |
| `PaymentRecord`               | Payment identity, event date, status, amount and refund                |
| `CampaignSpend`               | Campaign/channel identity, event date, spend, clicks and impressions   |
| `ImportBatch`                 | Upload fingerprint, pending payload, processing summary and row errors |
| `SavedReport`                 | Workspace/owner and validated report definition                        |
| `AuditLog`                    | Administrative, synchronization, import and reporting activity         |

Foreign keys maintain relationships. Source/external-ID constraints enforce record identity; a workspace/provider/mode constraint identifies each connection. Workspace/date/currency indexes support scoped exploration and aggregation. Sessions and import fingerprints have their own uniqueness constraints.

Queries use the authenticated workspace. Source/report lookups verify ownership instead of accepting a workspace from the request body. PostgreSQL is authoritative; Redis provides queues, schedules, heartbeat and short-lived caching.

Schema changes belong in `apps/api/prisma/schema.prisma` and a reviewed migration under `apps/api/prisma/migrations`. Regenerate the Prisma client after schema changes. Docker initialization and `npm run db:migrate` apply committed migrations; ordinary API startup does not run interactive schema development or destructive resets.

## Analytics and metric definitions

### Financial semantics

Amounts are stored and aggregated as **integer minor units**: USD 12.34 is stored as `1234`. Display formatting converts cents to dollars. Unsupported currency or precision is rejected before persistence.

The workspace selects one canonical revenue provider. Shopify order revenue and Stripe payment revenue are not added together because they can represent the same transaction.

| Metric              | Definition                                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Gross order sales   | Gross amounts from paid, non-cancelled orders; raw rows expose gross/discount/refund components                   |
| Net revenue         | Shopify canonical: gross minus discounts minus refunds; Stripe canonical: successful payment amount minus refunds |
| Orders              | Paid, non-cancelled commerce orders                                                                               |
| Average order value | Net order sales divided by order count, rounded to cents; remains order-based even when payments are canonical    |
| Refunds             | Canonical-provider refunds assigned to the original event date                                                    |
| Marketing spend     | Imported USD campaign spend                                                                                       |
| Revenue / spend     | Blended net revenue divided by spend; does not establish campaign attribution or attributed ROAS                  |
| Period change       | `(current - previous) / abs(previous) * 100`; null if prior data is absent or zero                                |

Zero differs from missing data. AOV and ratio return null for a zero denominator. Provider tax/shipping remain included where represented by the order total. Refund reconciliation uses original-event dates, not refund-date cash accounting or settlement accounting.

### Calendar behavior

UTC instants are persisted in PostgreSQL. Selected dates represent calendar days in the workspace's IANA timezone. The API converts them into half-open UTC intervals, including daylight-saving transitions. The `to` date is inclusive in the UI/API filter and becomes the next local day's exclusive boundary internally.

Day/week/month grouping follows that context. Comparison uses the preceding equal number of calendar days. Periods are capped at **400 days**. Charts, report previews and report exports use the same analytics service and definitions.

### Source selection and caching

Once a live commerce connection has successfully imported data, its generated counterpart is excluded from default analytics. An explicit source filter selects that source directly. CSV imports continue to augment campaign data.

Aggregates are cached for **60 seconds**, keyed by workspace, filters and workspace data version. Page commits and settings changes advance the version. Reads fall back to PostgreSQL when caching fails; a failed invalidation can leave an old result available until its TTL expires.

Freshness, last success, last attempt and source errors are separate from API readiness. A chart can contain persisted historical data even when a provider is currently unavailable.

## Provider integrations

### Shared adapter contract

Adapters implement `DataProvider.fetchPage({ cursor, since })` and return:

```ts
interface ProviderPage {
  records: NormalizedRecord[];
  nextCursor?: string;
  checkpoint?: string;
}
```

Normalized records are discriminated as `order`, `payment` or `campaign`, with a stable external ID, UTC event timestamp, supported currency and validated fields. Persistence does not depend on the provider response shape.

Generated providers use deterministic paginated fixtures through the same persistence path as background jobs. Live HTTP adapters use a 20-second timeout and bounded HTTP 429 handling. Provider error messages omit credentials and response bodies.

### Shopify

Configure server-side `SHOPIFY_DOMAIN`, read-only `SHOPIFY_TOKEN` and explicit `SHOPIFY_API_VERSION`. The domain must match the accepted `*.myshopify.com` shape. A suitable shop/token and account permissions are required; OAuth installation is not provided.

GraphQL orders are sorted by `UPDATED_AT`, with cursor pagination, inclusive updated-at filtering, status/cancellation and refund normalization. Supported USD amounts become integer cents. Gross is original total plus discounts; net is original discounted total minus refunds. Tax/shipping included in the original total remain included.

### Stripe

Configure `STRIPE_SECRET_KEY` beginning with `sk_test_`. Live-money `sk_live_` keys are intentionally rejected. The REST adapter reads charges using `starting_after` pagination and normalizes amount, refund and status.

Every run reconciles the complete bounded charge history. Creation-time watermarks cannot discover later refunds on older charges; webhook/event-based refund synchronization is not claimed. Amounts are charge amounts, not net settlement payouts.

### Applying configuration

For native development, stop API/worker, update `.env`, reseed to refresh source configuration, then restart. For Compose, use `docker compose down`, update provider environment values and run the documented build/start command again. Preserve volumes to retain records.

Transport fixtures verify mapping, pagination, rate limits and failures. Actual provider accounts were not used, and test mode blocks unintended default live-provider requests.

## API reference

The API prefix is **`/api/v1`**. The endpoint catalog and request definitions are available at [`/api/v1/openapi.json`](http://localhost:8080/api/v1/openapi.json); source is `apps/api/src/openapi.ts`. This is OpenAPI JSON, not a separately hosted Swagger UI.

| Group              | Endpoints, relative to `/api/v1`                                                                                | Access                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Authentication     | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`                                   | Login/refresh establish or rotate sessions; identity/logout require a session |
| Dashboard          | `GET /dashboard/summary`, `GET /dashboard/trends`, `GET /dashboard/sources`                                     | All authenticated roles                                                       |
| Analytics          | `GET /analytics/{view}` for `revenue`, `orders`, `payments`, `refunds`, `campaigns`, `comparison`               | All authenticated roles                                                       |
| Sources            | `GET /data-sources`, `GET /data-sources/:id`, `GET /data-sources/:id/status`, `GET /data-sources/:id/sync-runs` | All authenticated roles                                                       |
| Synchronization    | `POST /data-sources/:id/sync`, `GET/PATCH /data-sources/:id/schedule`                                           | Admin                                                                         |
| History/operations | `GET /sync-runs`, `GET /operations`                                                                             | All authenticated roles                                                       |
| Imports            | `POST /imports/csv`                                                                                             | Admin/Analyst; multipart field `file`                                         |
| Import results     | `GET /imports`, `GET /imports/:id`, `GET /imports/:id/errors`                                                   | All authenticated roles                                                       |
| Explorer           | `GET /data/:dataset`; datasets: `orders`, `payments`, `campaign-spend`                                          | All authenticated roles                                                       |
| Record export      | `GET /data/:dataset/export`                                                                                     | Admin/Analyst                                                                 |
| Reports            | `GET /reports`, `GET /reports/:id`, `POST /reports/:id/preview`                                                 | All authenticated roles                                                       |
| Report editing     | `POST /reports`, `PATCH/DELETE /reports/:id`, `POST /report-preview`, `GET /reports/:id/export`                 | Admin/Analyst                                                                 |
| Workspace          | `GET /settings/workspace`, `PATCH /settings/workspace`                                                          | Read: all roles; write: Admin                                                 |
| Team/audit         | `GET /settings/team`, `PATCH /settings/team/:id`, `GET /audit`                                                  | Admin                                                                         |

Analytics accepts `from`, `to`, `group` and optional `sourceId`. Explorer adds `page`, `pageSize`, `search`, `sort` and `direction`; page size is at most 100. Sort keys are `occurredAt` and `externalId`, with a stable ID tie-breaker.

Example report definition for an authenticated Admin/Analyst:

```json
{
  "name": "October revenue",
  "metric": "revenue",
  "group": "day",
  "from": "2026-10-01",
  "to": "2026-10-20"
}
```

### Cookie-authenticated API example

For local inspection, a POSIX shell can retain login cookies and obtain the public CSRF cookie before a mutation:

```sh
# This example writes a local session cookie file; do not commit it.
curl -c /tmp/prism-cookies.txt -H 'Content-Type: application/json' \
  -d '{"email":"admin@prism.local","password":"PrismAccess2026!"}' \
  http://localhost:8080/api/v1/auth/login

curl -b /tmp/prism-cookies.txt \
  'http://localhost:8080/api/v1/dashboard/summary?from=2026-10-01&to=2026-10-20&group=day'
```

The example performs login and a read. For authenticated writes, additionally read `prism_csrf` from the cookie jar and send the same value as `X-CSRF-Token`, with a matching Origin when supplied. The Angular interceptor handles this automatically.

Manual sync and queued imports return 202. Report creation returns 201; deletion returns 204. Completed duplicate uploads return 200. Typical errors include 400 for input, 401 for sessions, 403 for permission/CSRF/origin, 404 for unavailable owned resources, 409 for source conflicts, 413 for oversized JSON, and 503 for queue dependency failures. Oversized multipart uploads use the upload validator's 400 response.

Errors include a message and request ID:

```json
{
  "error": {
    "message": "Your role does not permit this action",
    "requestId": "request-specific-id"
  }
}
```

## Authentication and security

- Passwords use Argon2. Random opaque access/refresh tokens are hashed in PostgreSQL.
- Access sessions last 15 minutes; refresh validity is seven days. Refresh consumes/replaces the session transactionally to prevent simultaneous replay from rotating twice.
- Access/refresh cookies are HttpOnly with strict same-site behavior; production mode enables the secure flag.
- Mutations require matching `X-CSRF-Token`; a supplied Origin must match `WEB_ORIGIN`. Angular's interceptor attaches credentials/CSRF and coordinates refresh.
- Each protected request resolves the active account's membership and role. Logout revokes the current session and clears cookies.
- Zod validates input, Helmet sets API security headers, JSON is limited to 100 KB, and CSV has a separate 2 MB multipart limit.
- Login permits 15 requests per 15 minutes per IP; the general API budget is 300 requests per minute per IP. Limits use an in-process middleware store, not a distributed rate-limit service.
- Provider credentials stay server-side. Logs omit bodies, cookies, secrets and provider payloads; unexpected failures return a generic message/request ID.
- Audit records cover relevant configuration, roles, synchronization, import and reporting/export actions.

Compose is configured for local development. Production requires appropriate HTTPS/origin/cookie settings, credentials, proxy/rate-limit design and operational hardening. Changing only `NODE_ENV` is not a complete production deployment procedure.

## Operations and troubleshooting

### Health endpoints

| Endpoint                 | Meaning                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------- |
| `GET /health`            | HTTP process liveness                                                               |
| `GET /health/ready`      | Database, Redis and expiring worker heartbeat; 503 when a dependency is unavailable |
| `GET /api/v1/operations` | Authenticated dependency status for the interface                                   |

The worker refreshes its heartbeat every ten seconds with a 25-second Redis expiry. Readiness confirms application dependencies, not credentials/connectivity to optional providers.

### Common issues

| Symptom                                  | What to check                                                                                                    |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Install/build engine errors              | Use the Node version in `.node-version` and `npm ci`; check system Node before installing                        |
| Missing Prisma generated imports         | Run `npm run db:generate` before native type checking, builds or startup                                         |
| Database connection refused              | Check service, database, role/password and URL; container hostnames differ from native loopback                  |
| API live but readiness is 503            | Check database/Redis and worker; read native launcher logs or `docker compose logs api worker`                   |
| Sync/import stays queued                 | Restore Redis and restart the worker; re-upload a pending CSV to resume its existing batch                       |
| Source says Not configured               | Configure server credentials and reseed/restart; generated sources require no external credentials               |
| Native API cannot reach Compose database | Default Compose does not publish database/Redis ports; use native services or an intentional local port override |
| 403 after changing frontend address      | Match `WEB_ORIGIN` and use current session/CSRF cookies                                                          |
| 429 during bulk tests                    | Wait for the indicated reset; separate repeated login/browser/audit runs                                         |
| Empty charts at a later date             | Check reporting dates, generated reference date, source filter and canonical provider                            |
| Old values after a cache failure         | Cache can remain for 60 seconds; inspect worker progress and readiness                                           |
| WSL services disappear when idle         | Keep a WSL terminal active and verify its Docker/native services                                                 |
| Port conflict                            | Compose uses host 8080; native development uses 4400/3000. Public-port changes also require a matching origin    |

Native development uses Node 24.22.0 with Angular's normal dependency prebundling enabled. Previous cache/worker/prebundling overrides were insufficient for the intermittent Windows native exit. The pinned runtime includes the upstream Windows libuv assertion fix; see [QUALITY_REVIEW.md](QUALITY_REVIEW.md) for diagnosis and measured verification. `@angular/build` is managed at the root so the root Vite override applies consistently.

## Testing and verification

### Static checks and build

```sh
npm run db:generate
npm run lint
npx prettier --check .
npm run typecheck
npm run build
npm test
npm run test:web
```

### Native development-server regression

```sh
npx playwright install chromium
npm run test:dev-server
```

This test needs neither Docker nor PostgreSQL/Redis. It starts an isolated Angular dev server, opens/closes 30 browser contexts at mobile/tablet/desktop sizes, verifies CSS updates and restoration through the file watcher, then checks that the server still serves the application. The stylesheet is restored in cleanup. Run it separately from other frontend builds. A dedicated `windows-latest` CI job runs this regression on the pinned runtime; full application journeys additionally require the native services described below.

### Integration tests with native services

Tests create/delete fixtures and reset their queue. **Use an isolated `prism_test` database and Redis database 1; never use the application database, Redis database 0, or provider credentials.**

Have a PostgreSQL administrator create the test database once, owned by the application role:

```sql
CREATE DATABASE prism_test OWNER prism;
```

Migrate only the test database, then run the suite. POSIX shell:

```sh
DATABASE_URL=postgresql://prism:prism_local@127.0.0.1:5432/prism_test npm run db:migrate
npm run test:integration
```

PowerShell:

```powershell
$env:DATABASE_URL = 'postgresql://prism:prism_local@127.0.0.1:5432/prism_test'
npm run db:migrate
Remove-Item Env:DATABASE_URL
npm run test:integration
```

Integration configuration supplies isolated defaults. Use `TEST_DATABASE_URL`/`TEST_REDIS_URL` for different services. Removing the temporary PowerShell variable lets later native commands read the application URL from `.env` again.

### Browser tests

Start app/worker with `npm run dev`, then in another terminal:

```sh
npx playwright install chromium
npm run test:e2e
```

Playwright can start API/web when absent, but the worker must be running separately. Its default target is port 4400. To use installed Chrome and the Docker build from PowerShell:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'chrome'
$env:PLAYWRIGHT_BASE_URL = 'http://localhost:8080'
npm run test:e2e
Remove-Item Env:PLAYWRIGHT_BASE_URL
```

The fixture observes the general request budget and waits for reset. Repeated suites can still encounter the separate login limit; keep application limits enabled and space bulk runs appropriately.

### Compose smoke and container tests

With Compose healthy and host dependencies installed:

```sh
npm run test:compose
```

This checks Nginx readiness, three accounts/permissions, synchronization, duplicate prevention, partial CSV processing and the saved-report lifecycle.

Integration tests can also use container dependencies. Create `prism_test` once, then migrate and test:

```sh
docker compose exec -T postgres createdb -U prism prism_test
docker compose run --rm --no-deps -e DATABASE_URL=postgresql://prism:prism_local@postgres:5432/prism_test api npm run db:migrate
docker compose run --rm --no-deps --user root -e TEST_DATABASE_URL=postgresql://prism:prism_local@postgres:5432/prism_test -e TEST_REDIS_URL=redis://redis:6379/1 api npm run test:integration
docker compose run --rm --no-deps --user root api sh -c "npm test && npm run test:web"
```

Disposable test containers override the user because Vite writes temporary config/cache files. Running API/worker services retain UID 1000; image application files remain owned by the build user.

### Recorded results

Verification on **21 October 2026** completed **52 automated tests** on the updated native Windows toolchain: the 51 application tests plus the new native dev-server regression. The original 51 application tests also passed in the Docker environment.

| Check                                              | Observed result                                                                         |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Native dev-server stability regression             | 1 passed on Windows: 30 browser disconnects and live CSS update/restoration             |
| Domain/provider tests                              | 16 passed                                                                               |
| PostgreSQL/Redis integration tests                 | 18 passed; container run: 11.14 seconds                                                 |
| Angular component tests                            | 5 passed                                                                                |
| Chrome browser workflows                           | 12 passed; Docker target: 55.1 seconds                                                  |
| Type checks, production build, lint and formatting | Passed                                                                                  |
| Dependency audit at verification time              | 0 known vulnerabilities reported                                                        |
| Compose startup/readiness and smoke checks         | Passed                                                                                  |
| Full container recreation with volumes             | Data preserved; reseeding did not duplicate records                                     |
| Layout inspection                                  | Seven pages at 320/390/768/1024/1440 px; focused readability/overflow checks documented |

These are observed results, not exhaustive device, security or production-load coverage. Tests cover money, missing values, DST, provider pagination/errors, isolation, permissions/CSRF, concurrent refresh/uploads, lost queue acknowledgements, retries/checkpoints, idempotence, reports and mobile/desktop workflows.

A dedicated `windows-latest` job installs the pinned Node runtime and runs `test:dev-server` without external services. The Ubuntu job provisions PostgreSQL/Redis, installs dependencies, generates/migrates, runs lint/build/domain/component/integration checks, seeds, starts the worker and runs browser tests. Failure traces are uploaded. Hosted CI execution is not claimed by the local verification.

### npm command reference

| Command                    | Purpose                                                  |
| -------------------------- | -------------------------------------------------------- |
| `npm run dev`              | Start API, Angular and worker                            |
| `npm run worker`           | Start worker only                                        |
| `npm run db:generate`      | Generate Prisma client                                   |
| `npm run db:migrate`       | Apply committed migrations                               |
| `npm run db:seed`          | Initialize/update workspace records                      |
| `npm run typecheck`        | Workspace checks and Angular development build           |
| `npm run build`            | Contracts/API type checks and Angular production build   |
| `npm run lint`             | ESLint                                                   |
| `npm run format`           | Format repository sources                                |
| `npm test`                 | Domain/provider unit tests                               |
| `npm run test:web`         | Angular component tests                                  |
| `npm run test:integration` | Isolated database/queue integration tests                |
| `npm run test:e2e`         | Playwright workflows                                     |
| `npm run test:native`      | Native HTTP/queue/report smoke checks on port 4400       |
| `npm run test:dev-server`  | Isolated native dev-server disconnect/rebuild regression |
| `npm run test:compose`     | HTTP/queue/report smoke checks on port 8080              |

## Development conventions

Keep changes close to the layer that owns behavior:

- Add handlers to focused HTTP modules and retain the central authentication boundary.
- Put calculations and persistence orchestration in domain modules; share contracts instead of copying API/frontend definitions.
- For a provider, implement the normalized contract, register it, add transport fixtures and verify pagination, failures and replay.
- Validate before persistence, derive ownership from authentication, and use transactions/constraints for concurrent operations.
- Reuse the table, metric card, date filter, chart, status badge, brand and icon components before adding parallel presentation logic.
- Preserve integer money, calendar semantics and the shared analytics path when extending metrics/exports.
- Add behavior-focused regressions for meaningful fixes and run checks appropriate to the layer.
- Keep credentials server-side and generated/local artifacts out of commits. Generated Prisma output, builds, browser results and `.local` are ignored.

## Scope and limitations

PRISM delivers a persisted local BI application with exercised background workflows. Production certification is not claimed.

- The UI serves one workspace. Tenant provisioning, user creation, invitations, password recovery and billing are not implemented; team administration edits seeded members.
- Provider adapters need credentials and account-level verification. OAuth and webhook/event pipelines are absent; Stripe reconciles bounded full history in test mode.
- USD only: no FX conversion, campaign attribution, settlement or refund-date cash accounting.
- Uploads, exports and reporting windows are bounded. Larger workloads require streaming/object storage, performance work and capacity validation.
- Relevant history listings return up to 100 sync runs, 50 import batches and 50 audit entries. Long-term retention/archival policy is outside scope.
- Database-to-queue gaps are reconciled at worker startup, not by a continuous outbox reconciler.
- Production backups/restore, disaster recovery, load testing, exhaustive penetration testing and distributed operations remain unverified.
- Browser verification uses Chrome with responsive emulation. Physical Android/iOS devices, Safari and full assistive-technology coverage remain unverified.
- Dependency audit reflects advisories at execution time. Hosted CI and actual provider-account success are not implied by local tests.

Supporting documentation:

- [Implementation report](IMPLEMENTATION.md): features, implementation decisions and limits.
- [Quality review](QUALITY_REVIEW.md): cleanup, desktop/mobile checks, regressions and review boundaries.
- [Clean native installation verification](docs/CLEAN_INSTALL_VERIFICATION.md): fresh-folder installation, isolated services, preserved existing data and recorded test results.
- [Docker verification](DOCKER_VERIFICATION.md): commands, service versions, container tests and persistence counts.
