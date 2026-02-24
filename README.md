# SECTOR + Ueberblick

Two applications. One platform.

**SECTOR** is where you build. **Ueberblick** is what your team uses.

SECTOR is the administrative application -- a visual workspace where you design spatial workflows, configure forms, set up map layers, define roles, and create automation rules. Everything is drag-and-drop. No code, no developers, no deployment cycles.

Ueberblick is the field application your participants open on their phone. It reads the workflow configuration from SECTOR and renders a complete, offline-capable map application -- automatically. Change a workflow in SECTOR, and Ueberblick reflects it immediately. No rebuild, no update, no waiting.

Together they form a self-hosted platform for spatial data collection and process management, built for public administrations, facility managers, and field service operations where data needs to be captured reliably in the field -- even without network connectivity.

---

## SECTOR -- Define

*Spatial Engine for Collection, Task Orchestration & Role management*

### Workflow Builder

Design multi-stage workflows on a visual canvas. Drag stages into position, draw connections between them, attach forms and tools to each transition. Define start stages, intermediate stages, and end stages. Every workflow supports two modes: incident-based and survey-based collection.

### Forms

10 field types: short text, long text, number, email, date, file upload, dropdown, multiple choice, smart dropdown, and entity selector. Smart dropdowns populate their options dynamically based on other field values -- across stages. Entity selectors let participants pick from custom tables, marker categories, other participants, or roles. Forms support multiple pages, field-level validation (regex, min/max, file type restrictions), and visual layout control (half-width or full-width fields).

### Map Layers

5 source types: tile services (XYZ), WMS endpoints, GeoJSON, uploaded tile sets, and built-in presets (OpenStreetMap, CartoDB, ESRI Satellite, and more). Each layer supports opacity control, zoom range constraints, custom attribution, and role-based visibility. Upload your own tile sets and SECTOR processes them automatically with bounds detection and progress tracking.

### Roles & Permissions

Access control at every level. Create roles, assign them to participants, then define per role: which stages are visible, which tools are available, which map layers appear, which marker categories show up. Empty role lists default to "visible to all" -- so you start open and restrict as needed.

### Automation Engine

Three trigger types: on stage transition, on field value change, or on a schedule (cron). Build conditions with AND/OR logic and 8 comparison operators. Actions include setting field values, changing instance status, or moving an instance to a different stage. Scheduled automations enforce a 15-minute minimum interval and display human-readable descriptions of the cron expression.

### Icon Designer

Design custom marker icons directly in the application. Choose from 8 shapes (circle, square, rounded, hexagon, diamond, star, shield, or none), set colors, borders, and shadows, then place any SVG icon inside. Icons are assigned to workflow stages, marker categories, and individual filter values on the map.

### Custom Tables

Create your own reference data tables with typed columns (text, number, date, boolean). Use them as data sources in entity selector fields -- participants pick from your table data directly inside forms. Tables support role-based visibility and can be populated via CSV import.

---

## Ueberblick -- Use

*The field application that renders itself from your SECTOR configuration.*

### Offline-First

Ueberblick does not require a network connection to operate. Data is captured locally in IndexedDB, queued for upload, and synchronized automatically in the background once connectivity is restored. The sync loop runs every 30 seconds with exponential backoff on failure. Conflicts are detected and surfaced for participant review -- server state and local changes side by side.

### Geographic Packages

Download entire regions for offline use: map tiles, workflow definitions, marker data, and file attachments. Define the area, select zoom levels, pick the layers to include. Participants download the package once and work offline for as long as needed.

### Automatic UI

Everything the participant sees -- the map, the available workflows, the forms, the action buttons, the visible layers, the filter options -- is generated from the SECTOR configuration. There is no separate frontend to build or maintain. Change a workflow in SECTOR, and the participant interface updates on next sync.

### Mobile-Optimized

Ueberblick is built as a Progressive Web App. The participant interface uses bottom sheet navigation with swipe gestures, responsive layouts that adapt between desktop and mobile, and location-aware map controls. Installable on any device, no app store required.

### Spatial Data Collection

Participants create markers on the map, fill multi-page forms, upload files, and progress workflow instances through stages. Every action is tied to a geographic location. Filtering by workflow stage, field values, and marker categories lets participants focus on what matters to them.

### Audit Trail

Every action is logged with timestamp and user attribution. Field changes, stage transitions, tool usage, sync operations -- the complete history of every workflow instance is preserved and traceable.

---

## Architecture

| Component | Technology |
|-----------|-----------|
| Frontend | SvelteKit 5, Svelte 5, Tailwind CSS 4 |
| Backend | PocketBase (Go) with SpatiaLite |
| Offline Storage | IndexedDB |
| Maps | Leaflet with offline tile support |
| Workflow Canvas | XYFlow |
| Forms | sveltekit-superforms + Zod validation |
| i18n | Paraglide (EN / DE) |
| Installable | PWA with Workbox |

Self-hosted. Single binary backend. No external database required.

---

## Getting Started

_Documentation in progress._
