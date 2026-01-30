# NATS Eye - Project Plan

A self-hostable NATS cluster manager with a modern, slick dashboard interface.

## Tech Stack
- **Frontend**: React SPA with Vite
- **Routing**: TanStack Router (file-based)
- **Data Fetching**: TanStack Query
- **Backend**: Bun + Hono (REST API)
- **Database**: SQLite via `bun:sqlite` (zero dependencies, self-contained)
- **NATS Client**: nats.ws (WebSocket client)
- **UI**: Shadcn UI (New York style) + Tailwind CSS 4
- **Icons**: Lucide React
- **Validation**: Zod
- **Charts**: Recharts (for real-time monitoring charts)
- **Runtime**: Bun

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │   Auth UI   │  │  Dashboard   │  │  Cluster Manager  │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    TanStack Start API                        │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │  Auth API   │  │  NATS API    │  │  Settings API     │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                     NATS Clusters                            │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │  Cluster 1  │  │  Cluster 2   │  │     Cluster N     │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## TODO List

### Phase 1: Project Setup & Foundation ✅ COMPLETED
- [x] 1.1 Clean up demo files and reset project structure
- [x] 1.2 Set up SQLite database with schema (users, clusters, sessions)
- [x] 1.3 Set up dark mode with theme provider (system/light/dark)
- [x] 1.4 Install additional Shadcn components
- [x] 1.5 Create base layout with sidebar navigation
- [x] 1.6 Set up NATS.ws client dependency

### Phase 2: Authentication System ✅ COMPLETED
- [x] 2.1 Create login page UI
- [x] 2.2 Implement session-based auth with server functions
- [x] 2.3 Create auth middleware for protected routes (with TanStack Query caching)
- [x] 2.4 Add logout functionality
- [x] 2.5 Create initial admin setup flow (first-run experience)

### Phase 3: Cluster Connection Management ✅ COMPLETED
- [x] 3.1 Create cluster configuration schema (Zod)
- [x] 3.2 Build "Add Cluster" dialog with connection form
- [x] 3.3 Implement cluster connection testing
- [x] 3.4 Store cluster configurations
- [x] 3.5 Build cluster list/grid view with status indicators
- [x] 3.6 Implement cluster edit and delete functionality
- [x] 3.7 Support multiple auth types (none, token, username/password)
- [x] 3.8 Auto-split comma-separated URLs on paste

### Phase 4: Dashboard & Overview ✅ COMPLETED
- [x] 4.1 Create main dashboard layout
- [x] 4.2 Build cluster health overview cards
- [x] 4.3 Display server info (version, connections, subscriptions)
- [x] 4.4 Create real-time stats widgets (messages in/out, bytes)
- [x] 4.5 Add quick actions panel

### Phase 5: JetStream Streams ✅ COMPLETED
- [x] 5.1 Create streams list view with search/filter
- [x] 5.2 Build stream detail page with stats cards
- [x] 5.3 Implement stream creation dialog
- [x] 5.4 Add stream configuration view
- [x] 5.5 Implement stream purge/delete actions
- [x] 5.6 Build message browser with pagination
- [x] 5.7 Live message streaming via direct nats.ws connection from frontend

### Phase 6: JetStream Consumers ✅ COMPLETED
- [x] 6.1 Create consumers list view with cluster/stream filtering
- [x] 6.2 Build consumer detail page with real-time stats
- [x] 6.3 Implement consumer creation dialog
- [x] 6.4 Consumer configuration display
- [x] 6.5 Implement consumer delete action
- [x] 6.6 Display consumer metrics (pending, ack pending, redelivered)

### Phase 7: Key-Value Stores ✅ COMPLETED
- [x] 7.1 Create KV buckets list view with cluster selector
- [x] 7.2 Build KV bucket detail page with key browser
- [x] 7.3 Implement bucket creation dialog
- [x] 7.4 Add key create/edit/delete functionality (direct via nats.ws)
- [x] 7.5 Display key history and revisions
- [x] 7.6 Real-time key watching via direct nats.ws connection from frontend

### Phase 8: Object Store ✅ COMPLETED
- [x] 8.1 Create object store buckets list
- [x] 8.2 Build object browser
- [x] 8.3 Implement file upload/download
- [x] 8.4 Add object metadata viewer

### Phase 9: Monitoring & Metrics ✅ COMPLETED
- [x] 9.1 Create connections monitor page
- [x] 9.2 Build subscriptions viewer
- [x] 9.3 Add real-time message rate charts
- [x] 9.4 Implement server health checks
- [x] 9.5 Create alerts/notifications system

### Phase 10: Settings & Polish
- [ ] 10.1 Create settings page ✅ (basic version done)
- [ ] 10.2 Add theme customization options ✅ (done)
- [ ] 10.3 Implement data export functionality
- [ ] 10.4 Add keyboard shortcuts
- [ ] 10.5 Final UI polish and responsive design fixes

---

## Current Progress

**Status**: Phase 9 Complete - Ready for Phase 10 (Polish)
**Last Updated**: 2026-01-30

### Completed Files

```
src/
├── components/
│   ├── ui/                         # Shadcn components (24 components)
│   │   ├── button.tsx, card.tsx, dialog.tsx, dropdown-menu.tsx
│   │   ├── avatar.tsx, badge.tsx, tabs.tsx, sonner.tsx
│   │   ├── skeleton.tsx, separator.tsx, scroll-area.tsx
│   │   ├── sheet.tsx, tooltip.tsx, popover.tsx, table.tsx
│   │   ├── sidebar.tsx, breadcrumb.tsx, input.tsx, label.tsx
│   │   ├── select.tsx, switch.tsx, slider.tsx, textarea.tsx
│   │   ├── checkbox.tsx, progress.tsx
│   ├── layout/
│   │   ├── app-sidebar.tsx         # Main sidebar navigation with logout
│   │   └── app-header.tsx          # Page header with breadcrumbs
│   ├── theme-provider.tsx          # Theme context provider
│   └── theme-toggle.tsx            # Theme switcher dropdown
├── routes/
│   ├── __root.tsx                  # Root layout with ThemeProvider
│   ├── index.tsx                   # Auth check -> redirect to dashboard/login/setup
│   ├── login.tsx                   # Login page with form
│   ├── setup.tsx                   # Initial admin setup (first-run)
│   ├── _app.tsx                    # Protected app layout with sidebar
│   └── _app/
│       ├── dashboard.tsx           # Dashboard with stats cards
│       ├── clusters.tsx            # Clusters management (placeholder)
│       ├── streams.tsx             # Streams list (placeholder)
│       ├── consumers.tsx           # Consumers list (placeholder)
│       ├── kv.tsx                  # KV store (placeholder)
│       └── settings.tsx            # Settings with theme selector
├── lib/
│   ├── utils.ts                    # cn() utility
│   ├── db.ts                       # SQLite database with all CRUD operations
│   ├── auth.ts                     # Auth server functions + query options
│   └── nats-client.ts              # NATS WebSocket client utilities
├── hooks/
│   ├── use-theme.ts                # Theme hook (standalone)
│   └── use-mobile.ts               # Mobile detection hook
└── styles.css                      # Tailwind + CSS variables
```

### Database Ready (src/lib/db.ts)
- `users` table with password hashing support
- `sessions` table for auth
- `clusters` table for NATS connections
- `settings` table for app config
- Helper functions: createUser, getUserByUsername, createSession, getSession, etc.

### NATS Client Ready (src/lib/nats-client.ts)
- Connection management with WebSocket
- Test connection function
- JetStream manager access
- Stream/Consumer/KV listing utilities

---

## File Structure (Current)

```
src/
├── components/
│   ├── ui/                    # Shadcn components
│   ├── layout/
│   │   ├── app-sidebar.tsx
│   │   └── app-header.tsx
│   ├── monitoring/            # Monitoring components
│   │   ├── overview-tab.tsx   # Health + charts
│   │   ├── connections-tab.tsx
│   │   ├── subscriptions-tab.tsx
│   │   ├── alerts-tab.tsx
│   │   └── create-alert-dialog.tsx
│   ├── theme-provider.tsx
│   └── theme-toggle.tsx
├── routes/
│   ├── __root.tsx
│   ├── index.tsx
│   ├── login.tsx
│   ├── setup.tsx
│   ├── _app.tsx               # Layout wrapper with sidebar
│   └── _app/
│       ├── dashboard.tsx
│       ├── clusters.tsx
│       ├── streams/
│       │   ├── index.tsx      # Streams list
│       │   └── $clusterId/
│       │       └── $name.tsx  # Stream detail with live messages
│       ├── consumers.tsx
│       ├── kv/
│       │   ├── index.tsx      # KV buckets list
│       │   └── $clusterId/
│       │       └── $bucket.tsx # KV bucket detail with live watching
│       ├── objectstore/
│       │   ├── index.tsx      # Object Store buckets list
│       │   └── $clusterId/
│       │       └── $bucket.tsx # Object browser with upload/download
│       ├── monitoring.tsx     # Monitoring page with tabs
│       └── settings.tsx
├── lib/
│   ├── utils.ts
│   ├── api.ts                 # Frontend API client
│   └── ...
├── hooks/
│   ├── use-theme.ts
│   └── use-mobile.ts
└── styles.css

server/
├── index.ts                   # Hono server entry
├── db.ts                      # SQLite database
└── routes/
    ├── auth.ts
    ├── clusters.ts
    ├── consumers.ts
    ├── monitoring.ts          # Monitoring API endpoints
    ├── streams.ts
    ├── kv.ts
    ├── objectstore.ts
    └── stats.ts
```

---

## Design Guidelines

### Color Palette (Dark Mode Primary)
- Background: Zinc-950
- Card: Zinc-900
- Border: Zinc-800
- Primary: Blue-500
- Success: Green-500
- Warning: Amber-500
- Error: Red-500

### UI Principles
1. **Minimal**: Clean, uncluttered interface
2. **Informative**: Show relevant data at a glance
3. **Responsive**: Works on all screen sizes
4. **Accessible**: ARIA labels, keyboard navigation
5. **Fast**: Optimistic updates, skeleton loaders

---

## Notes

- **NATS operations happen on the frontend** via direct nats.ws connections (with one exception)
- Backend provides connection info (URLs, credentials) via `/api/clusters/:id/connect`
- Frontend connects directly to NATS for:
  - Live message streaming (Streams)
  - Real-time key watching (KV)
  - Key put/delete operations (KV)
  - Object Store operations (list, download, delete, bucket creation)
  - Bucket creation/deletion (KV, Object Store)
  - Stream/Consumer CRUD operations
- Backend handles:
  - User authentication (login, session)
  - Cluster configuration storage (add/edit/delete clusters, store credentials)
  - Providing connection info to frontend
  - **Object Store file uploads** (due to browser btoa encoding limitations with binary data in nats.ws)
  - **Monitoring API** (proxies NATS HTTP monitoring endpoints at port 8222)
    - Supports multiple monitoring URLs per cluster (for multi-server clusters)
    - Aggregates stats from selected servers (connections summed, CPU/memory per-server)
    - Server selector UI allows choosing which servers to include in view

**IMPORTANT**: Prefer frontend direct connections for NATS operations. The exception is Object Store file uploads which use the backend API at `/api/objectstore/cluster/:id/bucket/:name/upload` because nats.ws has issues encoding binary data with btoa. The backend uses the native `nats` package (not `nats.ws`) for uploads to avoid this issue.
- SQLite database stored in `data/nats-eye.db` (auto-created on first run)
- Zero external dependencies for storage - `bun:sqlite` is built into Bun
- Using nats.ws for WebSocket-based NATS connections (both frontend and backend)

## Database Schema

```sql
-- Users table (admin authentication)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Sessions table
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- Clusters table (NATS cluster configurations)
CREATE TABLE clusters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  urls TEXT NOT NULL,              -- JSON array of WebSocket URLs
  nats_urls TEXT,                  -- JSON array of NATS TCP URLs (optional)
  auth_type TEXT NOT NULL DEFAULT 'none',
  token TEXT,                      -- Optional: auth token
  username TEXT,
  password TEXT,
  monitoring_urls TEXT,            -- JSON array of HTTP monitoring endpoints (e.g., http://localhost:8222)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Alerts table (monitoring alert configurations)
CREATE TABLE alerts (
  id TEXT PRIMARY KEY,
  cluster_id TEXT NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  metric TEXT NOT NULL,            -- connections, subscriptions, slow_consumers, in_msgs_rate, out_msgs_rate
  condition TEXT NOT NULL,         -- gt, lt, gte, lte
  threshold REAL NOT NULL,
  enabled INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Alert events table (alert history)
CREATE TABLE alert_events (
  id TEXT PRIMARY KEY,
  alert_id TEXT NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  status TEXT NOT NULL,            -- triggered, resolved
  value REAL NOT NULL,
  message TEXT,
  created_at INTEGER NOT NULL
);

-- Settings table (app configuration)
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

## Authentication System (Phase 2 - Completed)

### Auth Flow
1. First visit: Check if users exist -> redirect to `/setup` if none
2. Setup page: Create admin account -> redirect to `/login`
3. Login page: Authenticate -> set session cookie -> redirect to `/dashboard`
4. Protected routes (`_app/*`): Check session via TanStack Query (cached)
5. Logout: Clear session from DB + cookie -> redirect to `/login`

### Key Files
- `src/lib/auth.ts` - Server functions + query options for caching
- `src/routes/login.tsx` - Login form
- `src/routes/setup.tsx` - Initial admin setup
- `src/routes/_app.tsx` - Protected layout with auth check

### Caching Strategy
- `setupCheckQueryOptions()` - 5 min staleTime (setup status rarely changes)
- `sessionQueryOptions()` - 1 min staleTime (session validation)
- Uses `queryClient.ensureQueryData()` in `beforeLoad` for fast navigation

## Next Steps

- **Phase 10 (Polish)**: Keyboard shortcuts, data export, UI improvements
