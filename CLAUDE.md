# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Überblick is a full-stack application for geographic data collection with offline-first capabilities. The admin interface is called "Überblick Sector" and the participant-facing app is "Überblick". It combines a SvelteKit frontend with a PocketBase backend enhanced with SpatiaLite for geospatial queries.


## Architecture

### Frontend (SvelteKit 5 + Svelte 5)
- **Routes**: Two main route groups with separate layouts
  - `/(admin)/` - Admin dashboard with sidebar navigation
  - `/participant/` - Mobile-optimized participant interface
- **UI Components**: shadcn-svelte (Tailwind CSS 4 + bits-ui)
  - Base components in `src/lib/components/ui/`
  - Custom components: `responsive-sidebar.svelte`, `entity-selector.svelte`, `role-selector.svelte`
- **State**: Svelte 5 runes (`$state`, `$derived`, `$effect`, `$bindable`, `$props`)
- **Forms**: sveltekit-superforms with Zod validation
- **i18n**: Paraglide with messages in `messages/{en,de}.json`

### Backend (PocketBase + Go)
- **Location**: `pb/` directory
- **Features**:
  - SpatiaLite extension for geospatial queries
  - Custom security middleware in `pb/security/`
- **Admin UI**: http://localhost:8090/_/

### Offline-First System (`src/lib/offline/`)
- IndexedDB storage via `idb` library
- Sync queue for background data upload
- Map tile caching with `leaflet.offline`
- Downloadable "packs" for geographic areas

### Data Flow
1. Server hooks (`hooks.server.ts`) handle PocketBase auth via cookies
2. Layout server files load auth state and make it available to routes
3. Client-side PocketBase client (`$lib/pocketbase.ts`) for browser operations
4. Offline actions queue locally, sync when online

## Key Patterns

### Authentication
- Auth handled in `hooks.server.ts` via cookie-based sessions
- `event.locals.pb` - PocketBase instance per request
- `event.locals.user` - Current user record
- Admin uses `users` collection, participants use separate `participants` collection

### Adding Translations
1. Add key to both `messages/en.json` and `messages/de.json`
2. Import in component: `import * as m from '$lib/paraglide/messages'`
3. Use: `{m.yourMessageKey()}`

### Mobile Layouts
For mobile interfaces, use the custom `responsive-sidebar.svelte` component which provides:
- Desktop: Right-side panel
- Mobile: Bottom drawer with swipe gestures

### Testing Structure
- Unit tests: `*.spec.ts` or `*.test.ts` (vitest)
- Svelte component tests: `*.svelte.spec.ts` (vitest-browser-svelte)
- E2E tests: `e2e/` directory (Playwright)

## Environment Variables

Required (see `.env.example`):
- `POCKETBASE_ADMIN_EMAIL` / `POCKETBASE_ADMIN_PASSWORD` - Admin credentials
- `PUBLIC_POCKETBASE_URL` - PocketBase API URL (set by Docker or local dev)

## Database Access

Direct SQL queries can be run on PocketBase's SQLite database
