# Überblick -- User Guide

Überblick is a tool for geographic data collection. An admin sets up projects with workflows, map layers, and participant roles. Participants use a mobile-friendly PWA to fill out forms, place markers on a map, and transition workflow instances through stages -- all of which works offline.

The admin interface is called **Überblick Sector**. The participant-facing app is called **Überblick**.

---

## What You Can Do Right Now

### As an Admin (Sector)

- **Manage projects** -- create projects, each with its own participants, roles, workflows, map layers, and data tables.
- **Build workflows** -- visual drag-and-drop builder with stages, connections, forms, edit tools, and automations. Two workflow types: *incident* (creates map markers) and *survey* (no markers).
- **Configure map layers** -- add tile layers (OSM, CartoDB, ESRI presets or custom URLs), WMS layers, or upload your own tiles as a ZIP.
- **Create offline packages** -- draw regions on the map, select zoom levels and layers, and generate downloadable tile packages for offline use.
- **Manage participants** -- create participant accounts with auto-generated access tokens, assign roles, define custom fields per project.
- **Define roles** -- control who can see which workflows, map layers, marker categories, and custom tables.
- **Set up automations** -- trigger actions (set field values, change stage, update status) based on field changes, stage transitions, or cron schedules. Supports arithmetic expressions and field-to-field comparisons.
- **Design icons** -- SVG-based icon designer for workflows, stages, and marker categories.
- **Export QR codes** -- generate PDF sheets of participant QR codes for easy login distribution.
- **Duplicate workflows** -- copy an entire workflow (stages, forms, fields, automations) within or across projects.

### As a Participant

- **View map** -- see markers, filter by workflow/field values, toggle layers.
- **Create incidents** -- tap the map, select a workflow, fill out forms, place a marker.
- **Progress through stages** -- complete forms, edit fields, transition to next stages as defined by the workflow.
- **Work offline** -- data is stored locally in IndexedDB first, synced to the server when connectivity returns. Map tiles are available offline if the admin prepared offline packages.

---

## Getting Started

### Prerequisites

- Docker and Docker Compose
- (For local dev without Docker: Node.js 20+, Go 1.24+)

### Quick Start (Docker)

```bash
# 1. Clone the repo
git clone <repo-url> && cd punktstudio

# 2. Create your environment file
cp .env.example .env
# Edit .env -- set POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD

# 3. Start everything
docker compose up --build

# Frontend:  http://localhost:8080
# PocketBase admin panel:  http://localhost:8090/_/
```

### Local Development (without Docker)

```bash
# 1. Install frontend dependencies
npm install

# 2. Create .env from .env.example
cp .env.example .env

# 3. Build and start the PocketBase backend
cd pb && go build && ./dev-entrypoint.sh
# (in a separate terminal)

# 4. Start the SvelteKit dev server
npm run dev
# Frontend: https://localhost:5173
# Vite proxies specific /api/ routes to PocketBase at localhost:8090
```

### First Use

1. Open the admin panel at `http://localhost:8090/_/` and log in with your admin credentials.
2. Open Sector at `http://localhost:8080` (Docker) or `https://localhost:5173` (dev). Log in with the same credentials.
3. Create a project.
4. Add roles (e.g. "Inspector", "Supervisor").
5. Add participants and assign them roles.
6. Create a workflow -- use the builder to add stages, forms, and connections.
7. Configure map layers (at minimum, add a base layer like OSM).
8. Share participant credentials (or export QR codes) so participants can log in at `/participant/login`.

---

## Common Tasks

### Adding a Map Layer

Go to your project's **Map Settings** page. Under the Layers tab:
- Click a preset (OSM, CartoDB, ESRI Satellite, etc.), or
- Enter a custom tile URL template like `https://tiles.example.com/{z}/{x}/{y}.png`, or
- Add a WMS layer with a capabilities URL, or
- Upload a ZIP of pre-rendered tiles.

One layer must be marked as the base layer.

### Creating an Offline Package

In **Map Settings > Offline Packages**:
1. Click "New Package".
2. Draw the region on the map.
3. Select min/max zoom levels and which layers to include.
4. Save. The server processes tiles in the background.
5. When status shows "ready", participants with the right roles can download it.

### Building a Workflow

1. Go to **Workflows** and click "New Workflow".
2. Open the **Builder**.
3. Add stages (each stage represents a step in the process).
4. Connect stages with edges (edges define transitions and which tool/action triggers the transition).
5. Attach tools to connections or stages:
   - **Form Fill** -- participant fills out a form you design.
   - **Edit Fields** -- participant edits previously entered values.
   - **View Fields** -- read-only display of field values.
   - **Location Edit** -- participant can reposition the marker.
6. Add automations for logic that should run automatically (e.g., "when field X > 100, move to stage Y").
7. Save.

### Setting Up Automations

In the workflow builder, add an automation tool to a connection or as a global tool:
- **Trigger**: `on_transition`, `on_field_change`, or `scheduled` (cron expression, minimum 15-minute intervals).
- **Conditions**: field equals/not equals/contains/greater than/less than a value, or compare two fields.
- **Actions**: `set_field_value` (supports arithmetic like `{quantity} * {price}`), `set_stage`, `set_instance_status`.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `POCKETBASE_ADMIN_EMAIL` | Yes | -- | Admin account email |
| `POCKETBASE_ADMIN_PASSWORD` | Yes | -- | Admin account password |
| `PUBLIC_POCKETBASE_URL` | No | (proxy) | Direct PocketBase URL (only for mobile device testing) |
| `BODY_SIZE_LIMIT` | No | `500M` | Max upload size |
| `PB_BATCH_ENABLED` | No | `true` | Enable batch API |
| `PB_BATCH_MAX_REQUESTS` | No | `100` | Max operations per batch |
| `PB_BATCH_TIMEOUT` | No | `30` | Batch timeout (seconds) |
| `PB_BATCH_MAX_BODY_SIZE` | No | `128MB` | Max batch body size |

---

## Known Limitations

- **No conflict resolution UI** -- when offline edits conflict with server changes, the server version wins. Conflicts are stored internally but there is no participant-facing screen to review them.
- **Offline pack download UI is not integrated** -- the admin can create offline packages, but the participant app does not yet have a UI to browse and download them. Tiles must be pre-cached.
- **No CI test pipeline** -- E2E and unit tests exist but are not wired into the GitHub Actions workflow (which only builds Docker images).
- **Field tagging** -- the `tools_field_tags` system exists in the database but the editor UI is minimal (~100 lines). Functionality may be incomplete.
- **Filter value icons** -- the `filter_value_icons` collection is created but full UI integration on the participant map is uncertain.
- **Single-project participant login** -- participants are scoped to a project; cross-project access is not supported.
- **Automation engine** -- has been rewritten three times and includes workarounds for PocketBase autodate limitations (raw SQL). It works but may have edge cases.
