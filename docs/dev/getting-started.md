# Getting Started

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 22+ | Runtime for SvelteKit (see `Dockerfile.frontend`) |
| Go | 1.24+ | Builds the custom PocketBase binary with SpatiaLite |
| libspatialite | -- | Required for geospatial queries (e.g. `apt install libspatialite-dev`) |
| Docker | (optional) | For containerized deployment |
| modd | (optional) | Hot-reload for Go backend (`go install github.com/cortesi/modd/cmd/modd@latest`) |

## Quick Start: Docker

```bash
cp .env.example .env
# Edit .env: set POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD

docker compose up --build
```

This starts two containers:

| Service | URL | Description |
|---------|-----|-------------|
| Frontend (nginx) | `http://localhost:8080` | SvelteKit app served via nginx reverse proxy |
| PocketBase | `http://localhost:8090` | Backend API + admin UI |

## Local Development Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set at least the two required variables:

```
POCKETBASE_ADMIN_EMAIL=admin@example.com
POCKETBASE_ADMIN_PASSWORD=changeme123
```

### 3. Start PocketBase (terminal 1)

Option A -- single run:

```bash
npm run backend
```

This runs `pb/dev-entrypoint.sh`, which builds the Go binary, creates/updates the admin account from `.env`, and starts PocketBase with `--dev` mode.

Option B -- hot-reload (rebuilds on Go/hook file changes):

```bash
npm run dev:backend
```

This uses [modd](https://github.com/cortesi/modd) with the config in `pb/modd.conf`.

### 4. Start SvelteKit (terminal 2)

```bash
npm run dev
```

SvelteKit starts on `https://localhost:5173` with a self-signed SSL certificate (via `@vitejs/plugin-basic-ssl`). The `--host` flag is enabled by default, so the server is accessible from other devices on the network.

### 5. Verify

1. Open `http://localhost:8090/_/` -- PocketBase admin UI. Log in with your `.env` credentials.
2. Open `https://localhost:5173` -- the admin interface (Sector).
3. Check `http://localhost:8090/api/spatial-test` to confirm SpatiaLite is loaded.

## Environment Variables

All variables are set in the root `.env` file. PocketBase's `dev-entrypoint.sh` loads this file automatically.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `POCKETBASE_ADMIN_EMAIL` | Yes | -- | Superuser email (created/updated on startup) |
| `POCKETBASE_ADMIN_PASSWORD` | Yes | -- | Superuser password |
| `PUBLIC_POCKETBASE_URL` | No | (auto-detected) | Override PocketBase URL. Only needed for mobile device testing on LAN (set to `http://YOUR_LAN_IP:8090`) |
| `BODY_SIZE_LIMIT` | No | `500M` | SvelteKit max request body size |
| `PB_BATCH_ENABLED` | No | `true` | Enable PocketBase batch API |
| `PB_BATCH_MAX_REQUESTS` | No | `100` | Max operations per batch request |
| `PB_BATCH_TIMEOUT` | No | `30` | Batch timeout in seconds |
| `PB_BATCH_MAX_BODY_SIZE` | No | `134217728` | Max batch body size in bytes (128 MB) |

### How PocketBase URL resolution works

The URL is resolved in `src/lib/config/pocketbase.ts` with this priority:

1. If `PUBLIC_POCKETBASE_URL` is set, use it (any environment).
2. Client-side (browser): use `window.location.origin` -- Vite proxy or nginx forwards `/api/*` to PocketBase.
3. Server-side in Docker: use `http://backend:8090` (Docker service name).
4. Server-side local dev: use `http://127.0.0.1:8090`.

## Vite Proxy

In development, Vite proxies these paths to `http://127.0.0.1:8090`:

```
/api/collections
/api/files
/api/admins
/api/realtime
/api/health
/api/batch
/_/
```

SvelteKit's own server routes (e.g. anything under `src/routes/**/+server.ts`) are handled directly by Vite and are **not** proxied. Do not add a catch-all `/api` proxy.

## Commands Reference

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server (HTTPS, `--host` enabled) |
| `npm run backend` | Build and start PocketBase via `dev-entrypoint.sh` |
| `npm run dev:backend` | PocketBase with modd hot-reload |
| `npm run build` | Production build (SvelteKit + Vite) |
| `npm run build:backend` | Build the Go binary only (`cd pb && go build`) |
| `npm run check` | Run `svelte-check` for type errors |
| `npm run check:watch` | Same as above, in watch mode |
| `npm run lint` | Prettier check + ESLint |
| `npm run format` | Auto-format with Prettier |
| `npm run test:unit` | Vitest -- runs two projects: `client` (browser via Playwright) and `server` (Node) |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run test` | Run unit tests (non-watch) + e2e tests |
| `npm run db:clear` | Delete all PocketBase data (`rm -rf pb/pb_data/*`) |
| `npm run storybook` | Storybook dev server on port 6006 |

## Dev URLs

| URL | What |
|-----|------|
| `https://localhost:5173` | SvelteKit dev server (admin + participant) |
| `https://localhost:5173/participant/map` | Participant app entry point |
| `http://localhost:8090/_/` | PocketBase admin UI |
| `http://localhost:8090/api/health` | PocketBase health check |
| `http://localhost:8090/api/spatial-test` | SpatiaLite version check |
| `http://localhost:6006` | Storybook (when running) |

## Testing

### Unit tests

```bash
npm run test:unit
```

Vitest is configured with two test projects (see `vite.config.ts`):

- **`client`** -- Svelte component tests (`*.svelte.test.ts` / `*.svelte.spec.ts`), run in a real browser via `@vitest/browser` + Playwright.
- **`server`** -- Everything else (`*.test.ts` / `*.spec.ts`, excluding `.svelte.` variants), run in Node.

### End-to-end tests

```bash
npm run test:e2e
```

Uses Playwright. Test files live in the `e2e/` directory.

## Troubleshooting

**"SpatiaLite not available" on backend start**
Install the SpatiaLite library for your OS. On Debian/Ubuntu: `sudo apt install libspatialite-dev`. On macOS: `brew install libspatialite`.

**Self-signed certificate warning in browser**
Expected. The dev server uses `@vitejs/plugin-basic-ssl` to enable HTTPS (required for PWA and some browser APIs). Accept the warning to proceed.

**PocketBase port already in use**
Another PocketBase instance may be running. Kill it or change the port. The default is `8090`.

**Vite proxy returning 502**
PocketBase is not running. Start it first (`npm run backend`), then start Vite.
