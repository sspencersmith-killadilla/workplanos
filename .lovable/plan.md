
# Plan: WorkOS — a Monday-style workflow & project platform

A premium, Linear-inspired collaboration platform built on TanStack Start + Lovable Cloud (Postgres/Supabase) + server functions. No AI features.

## Build phases

Because the spec is large, I'll ship it in ordered phases inside this same project. Each phase ends in a working, testable surface — you can stop me between phases if priorities shift.

### Phase 1 — Foundation: Cloud, auth, schema, design system
1. Enable Lovable Cloud and configure Email/Password + Google sign-in (managed broker).
2. Create the relational schema (see "Database schema" below) via one migration: workspaces, memberships, boards, groups, columns, items, sub-items, cell values, comments, activity log, automations, forms, dashboards. RLS on every table, scoped through `workspace_members` + `has_role` security-definer functions.
3. Install design system: Linear-inspired premium tokens in `src/styles.css` (oklch palette, sharp 6px radii, IBM Plex Sans + JetBrains Mono via `<link>` in `__root.tsx`, dark-first with light mode, dense spacing scale, subtle shadows, keyboard-driven focus rings).
4. Auth routes (`/auth`, `/auth/callback`) and the integration-managed `_authenticated` layout. Sign-out hygiene wired in root.

### Phase 2 — App shell & workspace navigation
- Left rail: workspace switcher + collapsible board tree, command palette (⌘K) for jump-to-board/item.
- Top bar: breadcrumbs, search, user menu, presence avatars.
- Workspace settings page: members, invites by email, roles (owner / admin / member / viewer) stored in `workspace_members`.

### Phase 3 — Boards: structure, groups, items, sub-items
- Board CRUD, group CRUD (color-coded, reorderable), item CRUD with sub-items.
- Drag-to-reorder via dnd-kit (groups, items within a group, items between groups).
- Optimistic mutations with TanStack Query + server functions; realtime updates via Supabase channels for cross-user sync.

### Phase 4 — Dynamic custom columns (the engine)
Column types implemented natively: `status`, `people`, `date`, `timeline`, `number`, `formula`, `link`, plus `text` as base.
- Per-board column definitions stored as rows in `board_columns` with a typed `settings` jsonb (status labels & colors, formula expression, number format/currency).
- Cell values stored in `item_values` (one row per item × column) with a typed value column per kind (`text_value`, `number_value`, `date_value`, `date_end_value`, `link_url`, `link_label`, `status_option_id`, `people_user_ids uuid[]`).
- Inline editors for each column type. Column footer aggregations (sum/avg/count/min/max) computed in DB view.
- Add / rename / reorder / hide / delete columns from a column-header menu.

### Phase 5 — Views (tabbed pivot over same data)
- Main Table — virtualized grid (tanstack-virtual), sticky first column, frozen header, inline editing, multi-select, bulk actions.
- Kanban — dnd-kit columns grouped by chosen Status column; drag card to change status.
- Calendar — month grid powered by a chosen Date or Timeline column; click date to create item.
- Workload — per-assignee swimlanes with per-day bars summing timeline items; capacity hint by item count.

Each view is a row in `board_views` (kind, settings) so users can save multiple per board.

### Phase 6 — Collaboration drawer
- Click any item → right-side sheet with tabs: **Updates** (rich-text comments via TipTap, edit history), **Activity** (immutable change log from `item_activity`), **Files** (Lovable Cloud storage), **Sub-items**.
- @mentions trigger in-app notifications row in `notifications`.

### Phase 7 — Forms (public intake)
- Form builder bound to a board: pick which columns are public, set labels/help text, required flags.
- Public route `/f/$formId` (no auth) renders form; submission goes through a `/api/public/forms/$formId/submit` server route that validates with Zod, verifies the form is published, and inserts a new item via `supabaseAdmin`.
- Shareable URL, submission counter, optional thank-you message and redirect.

### Phase 8 — Automations (no AI)
- Visual builder: pick a trigger, pick an action, save as `automation_rules`.
- Triggers: status change to X, person assigned, date arrives, item created, sub-item completed.
- Actions: set another status, reassign person, push notification, create sub-item, move to group.
- Execution: synchronous triggers run inside the mutating server function (after RLS-checked write). Date-based triggers run via a `pg_cron` job hitting `/api/public/automations/tick` (signature-verified) every 5 min.

### Phase 9 — Dashboards
- Workspace-level dashboards = grid of widgets (`dashboards`, `dashboard_widgets`).
- Widget kinds: progress battery (status distribution bar), number tile (sum/avg from numeric column across one or many boards), chart (recharts: bar/pie/line over time), people workload mini.
- Widgets configured by picking source boards + column + aggregation.

### Phase 10 — Polish pass
- Keyboard shortcuts (j/k navigation, ⌘Enter to save, / to focus search).
- Empty states, skeleton loaders, toasts (sonner), error boundaries on every route.
- SEO metadata on every public route (auth, form, landing), share-card OG for forms.

## Database schema (high level)

```text
profiles(id pk → auth.users, full_name, avatar_url, email)
workspaces(id, name, slug, owner_id, created_at)
workspace_members(workspace_id, user_id, role enum, PRIMARY KEY(workspace_id, user_id))
boards(id, workspace_id, name, description, icon, color, position)
board_views(id, board_id, kind enum, name, settings jsonb, position)
groups(id, board_id, name, color, position, collapsed)
items(id, board_id, group_id, parent_item_id nullable, title, position, created_by, created_at)
board_columns(id, board_id, kind enum, title, settings jsonb, position, width)
item_values(item_id, column_id,
            text_value, number_value, date_value, date_end_value,
            link_url, link_label, status_option_id, people_user_ids uuid[])
            PRIMARY KEY(item_id, column_id)
comments(id, item_id, author_id, body_json, created_at, edited_at)
item_activity(id, item_id, actor_id, kind, payload jsonb, created_at)
notifications(id, user_id, kind, payload jsonb, read_at, created_at)
forms(id, board_id, slug, title, description, fields jsonb, is_published, redirect_url)
form_submissions(id, form_id, item_id, payload jsonb, submitted_at)
automation_rules(id, board_id, trigger jsonb, actions jsonb, enabled, created_by)
automation_runs(id, rule_id, item_id, status, error, ran_at)
dashboards(id, workspace_id, name, layout jsonb)
dashboard_widgets(id, dashboard_id, kind, settings jsonb, position)
```

- RLS: every table policy resolves through `workspace_members` membership of the row's owning workspace, with role checks for write operations. `has_role(_user_id, _workspace_id, _role)` is `SECURITY DEFINER` to avoid recursion.
- Aggregates exposed as Postgres views for column footers and dashboard widgets.

## Technical details (for reference)

- Reads default to TanStack Query `ensureQueryData` in loader + `useSuspenseQuery` in component.
- All writes go through `createServerFn` with `requireSupabaseAuth`; admin-only ops use `supabaseAdmin` loaded inside the handler.
- Realtime: subscribe per board to `items`, `item_values`, `comments` channels; invalidate the affected query keys.
- Drag-and-drop: dnd-kit across Kanban, Table row reorder, Group reorder, Dashboard widget grid.
- Rich text: TipTap with image upload to Lovable Cloud storage.
- Charts: recharts.
- Virtualization: @tanstack/react-virtual for table and large item lists.

## What I'd like to confirm before starting

- Sound good to start with **Phase 1 + Phase 2** in the first build (foundation + shell + auth) so you can sign in and see workspaces before I move into boards/columns? Or do you want me to push straight through Phases 1–4 in one shot (foundation + boards + columns + table view) for a more demo-able first deliverable? I'll default to **Phases 1–4 in the first build** unless you tell me otherwise.
