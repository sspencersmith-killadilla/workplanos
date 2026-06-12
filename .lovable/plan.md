
# Path to Production — Free & Open Source

No billing, ever. Scope below covers every gap identified in the readiness audit, ordered by user impact and dependency.

---

## Phase 10 — Workspace Members & Invites
Unblocks team collaboration (today only the owner can use a workspace).

- New server fns (`src/lib/members.functions.ts`): `listMembers`, `inviteMember` (by email), `acceptInvite`, `updateMemberRole`, `removeMember`, `leaveWorkspace`.
- New table `workspace_invites` (email, workspace_id, role, token, expires_at, invited_by). RLS + GRANTs per house rules.
- Accept flow: public route `/invite/$token` → if signed-in, accept; else send to `/auth` then back.
- UI: `w.$workspaceId.members.tsx` — list, role dropdown (owner/admin/member/viewer), invite form, pending invites, remove/leave actions.
- Sidebar link "Members" + owner-only "Settings".

## Phase 11 — Profile & Account Settings
- Route `/_authenticated/account.tsx`: update name, avatar (upload to existing storage), change password, sign out everywhere.
- Server fns in `src/lib/profile.functions.ts`.
- Avatar shown in sidebar + item assignees.

## Phase 12 — Notifications
- Inbox popover in top bar with unread badge, realtime subscribe to `notifications` table for current user.
- Triggers (DB): on `comments` insert with @mention, on `items` assignee change, on automation runs that target a user.
- Mark-as-read / mark-all-read server fns.
- Route `/_authenticated/inbox.tsx` for full history.

## Phase 13 — People Column + Global Search
- People picker: replace "soon" placeholder. Stores `user_id[]` in item_values; assignee chips with avatar; filter by assignee in views.
- Global search: cmd+k palette. Server fn `search(workspaceId, q)` queries boards, items (name + text values), comments. Ranked, grouped results, deep links.

## Phase 14 — Board UX polish
- Drag-to-reorder groups and items in Table view (dnd-kit, persist `position`).
- View settings UI: filters, group-by, sort, hidden columns — persisted to `board_views.settings` JSONB. Apply across Table/Kanban/Calendar/Workload.
- Mobile responsive board canvas: stacked card list under `md`, sticky header, touch-friendly drawer.
- Error boundaries on each route, retry buttons that call `router.invalidate()`.

## Phase 15 — Data lifecycle & resilience
- Archive/soft-delete: `archived_at` on boards/items; "Archived" filter; restore action; hard delete after 30 days via pg_cron.
- Export: per-board CSV + workspace JSON export server fn (admin/owner only).
- Comments edit + delete (author or admin).
- Activity log: ensure every mutation writes to `item_activity` (assignee change, status change, value edits, file add/remove).
- Performance: paginate items per group (50/page), virtualize long lists, fetch values per visible page rather than whole board.
- Rate limiting on auth + invite + search fns (in-memory token bucket per user-id is fine for self-host).

## Phase 16 — Self-host & docs polish
- Update `USER_GUIDE.md`: member roles, invites, notifications, search, keyboard shortcuts, view settings, export/restore.
- Add `DEPLOY.md`: env vars, Supabase project setup script, migrations, OAuth provider setup, Cloudflare/Vercel build commands.
- `docker-compose.yml` for fully local Supabase + app.
- Seed script for demo workspace.
- Keyboard shortcuts: `?` cheat-sheet, `c` new item, `/` focus search, `g b` go to boards.

---

## Out of scope (explicit)
- Billing, plans, Stripe/Paddle. Free forever.
- SSO/SAML, advanced enterprise audit (basic activity log only).
- Formula column, Timeline view, board templates marketplace — nice-to-haves, deferred.

## Technical notes
- All new tables follow the GRANT → RLS → POLICY order; user-scoped policies via `is_member` / `has_ws_role`.
- All new server fns use `requireSupabaseAuth` + workspace-role checks. Privileged ops (invite accept by token) load `supabaseAdmin` inside the handler.
- Notifications + search use realtime channels already wired in `__root.tsx`.
- No new external services required; everything runs on Lovable Cloud or any self-hosted Supabase.

Each phase is independently shippable; recommend executing in order. After phase 12 the product is genuinely usable by a team; phases 13–16 bring it to production polish.
