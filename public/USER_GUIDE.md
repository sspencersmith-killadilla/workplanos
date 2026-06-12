
## Admin features

### Workspace admin (owners + admins)
- Workspace **Members** page: invite by email, change roles, remove people, and **lock** a member inside the workspace. Locked members keep their account but their items, comments, and files are hidden from the rest of that workspace until you unlock them.

### Site super-admin
- A super-admin sees a **shield** icon in the workspace sidebar that links to `/admin`.
- **Users tab:** search every account, lock/unlock globally (signs the user out and hides their content everywhere), grant or revoke the super-admin role.
- **Platform settings tab:** store a shared AI provider + API key for AI features (used by future AI functionality; safe to leave blank).

### Bootstrapping the first super-admin
There is no super-admin out of the box. After your first account exists, run this once against the database (replace the email):

```sql
insert into public.user_roles (user_id, role)
select id, 'super_admin' from auth.users where email = 'you@example.com';
```

You will then see the shield icon and be able to grant the role to others from the UI.
# User Guide

A workspace-based work-management platform with boards, items, views, forms, automations and dashboards. This guide covers self-hosted installation (without Lovable) and end-user operation of every feature.

---

## Part 1 — Installation (self-hosted)

The app is a TanStack Start (React 19 + Vite 7) front-end with a Supabase backend. You can run it anywhere Node/Bun runs; the backend is plain Postgres + Supabase Auth/Storage, so any Supabase project (cloud or self-hosted) works.

### 1.1 Prerequisites

- **Node.js 20+** or **Bun 1.1+** (Bun recommended — the lockfile is `bun.lock`)
- **Git**
- **A Supabase project** — either:
  - [supabase.com](https://supabase.com) (free tier is fine), or
  - A self-hosted Supabase stack (`supabase/supabase` Docker compose)
- **Supabase CLI** (`npm i -g supabase`) for applying migrations

### 1.2 Clone & install

```bash
git clone <your-repo-url> myapp
cd myapp
bun install         # or: npm install
```

### 1.3 Create the Supabase project

1. In the Supabase dashboard, create a new project. Note the **Project URL**, **anon (publishable) key**, and **service_role key**.
2. Link the CLI:
   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   ```
3. Push the schema (all tables, RLS policies, triggers, the `has_role` security-definer function, etc.):
   ```bash
   supabase db push
   ```
   This applies every file in `supabase/migrations/` in order.

### 1.4 Configure authentication

In the Supabase dashboard → **Authentication → Providers**:

- **Email**: enable. For development you can enable "Auto-confirm" so signups don't require an email click; for production, leave it off and configure SMTP.
- **Google** (optional but recommended — the UI exposes it): enable the Google provider and paste a Client ID / Secret from a Google Cloud OAuth 2.0 credential. Add `https://<project-ref>.supabase.co/auth/v1/callback` as an authorized redirect URI in Google Cloud.
- **Site URL & redirects**: set the site URL to your deployed origin (e.g. `https://app.example.com`) and add `http://localhost:3000` to the additional redirect URLs for local dev.

### 1.5 Environment variables

Create `.env` at the project root:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon-key>
VITE_SUPABASE_PROJECT_ID=<project-ref>

# Server-only (used by admin server functions: form submissions, automation runs, etc.)
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

Never commit `.env`. The `VITE_*` keys are public and ship to the browser; the service role key is server-only and is read inside server-function handlers.

### 1.6 Run locally

```bash
bun run dev
```

Open <http://localhost:3000>. Create the first account from the `/auth` page.

### 1.7 Build for production

```bash
bun run build
bun run preview   # smoke-test the production build
```

The build target is a serverless edge worker (Cloudflare Workers / compatible). Deploy options:

- **Cloudflare Workers** — `wrangler deploy` with the generated `.output/` bundle; configure the `SUPABASE_SERVICE_ROLE_KEY` and `VITE_*` vars as Worker secrets/vars.
- **Netlify / Vercel** — pick the "TanStack Start" framework preset. Set the same env vars in the dashboard.
- **Node server** — `node .output/server/index.mjs` behind your reverse proxy (nginx, Caddy). Use a process manager (pm2, systemd).

### 1.8 Post-install checklist

- [ ] You can sign up and sign in.
- [ ] After your first sign-up, run this in the Supabase SQL editor to grant yourself the admin role (the `app_role` enum and `user_roles` table are created by the migrations):
  ```sql
  insert into public.user_roles (user_id, role)
  values ('<your-auth-user-id>', 'admin');
  ```
- [ ] Creating a workspace and a board succeeds (verifies RLS + grants).
- [ ] A public form submission lands on the target board (verifies the service-role path).

---

## Part 2 — Concepts

| Concept | Description |
|---|---|
| **Workspace** | Top-level container. Has members with roles (owner / admin / member). Everything lives inside a workspace. |
| **Board** | A table-like collection of items, with configurable columns and groups. |
| **Column** | A typed field on a board: text, number, date, status, person, link. |
| **Group** | A horizontal section within a board (e.g. "To Do", "In Progress"). |
| **Item** | A row. Holds one value per column. |
| **View** | A saved way of looking at a board: Table, Kanban, Calendar, Timeline. |
| **Form** | A public web form whose submissions become items on a chosen group. |
| **Automation** | A "When X happens, then do Y" rule that runs on item changes. |
| **Dashboard** | A grid of widgets (KPI count, status breakdown, sum, board link) that aggregates data across boards in a workspace. |

---

## Part 3 — Operating the app

### 3.1 Sign up / sign in

Visit `/auth`. Sign up with email/password or Google. After confirming your email (if confirmation is enabled), you land on the workspace picker.

### 3.2 Workspaces

- **Create**: click **New workspace**, give it a name. You become the owner.
- **Invite members**: workspace settings → **Members** → invite by email. Assign role (admin can manage boards & members; member can use boards).
- **Switch workspace**: use the workspace switcher in the top-left.

### 3.3 Boards

- **Create a board**: from the workspace sidebar, click **+ Board**. Choose a starter template or start blank.
- **Columns**: click **+** at the end of the column row. Pick a type:
  - *Text* — free text.
  - *Number* — numeric input. Used by dashboard "Sum" widgets.
  - *Date* — date picker. Powers the Calendar and Timeline views.
  - *Status* — colored dropdown. Edit options inline. Powers Kanban, status breakdowns, and automations.
  - *Person* — assign a workspace member.
  - *Link* — URL with optional label.
- **Groups**: click **+ Group** to add a section. Drag groups to reorder. Rename inline.
- **Items**: click **+ Add item** at the bottom of any group. Click a cell to edit; changes auto-save.
- **Drag and drop**: items can be dragged between groups (and reordered within a group). Groups can be reordered too.

### 3.4 Views

The view switcher sits in the board header. All views read the same data — switching is non-destructive.

- **Table** — the default grid. Best for editing.
- **Kanban** — columns are status options of the selected status column. Drag cards across to change status.
- **Calendar** — monthly grid keyed off the selected date column.
- **Timeline** — Gantt-style bars, requires a start-date and an end-date column.

### 3.5 Item drawer

Click any item title to open the side drawer:

- Edit every field.
- Add **comments** (visible to all workspace members; supports basic markdown).
- View the **activity log** — every value change is recorded with user + timestamp.

### 3.6 Public forms

From the board header → **Forms**.

1. **New form**: name it; choose the **destination group** that submissions will create items in.
2. **Add fields**: each field maps to a board column. Mark fields required or optional. Reorder by drag.
3. **Publish**: toggle **Published** on. A public URL appears (`/f/<slug>`). Anyone with the link can submit — no login required.
4. **Thank-you redirect** (optional): paste a URL to send submitters to after a successful submit.
5. **Submissions**: the same page lists recent submissions with timestamps. Each submission has already been written to the board as a new item — open the board to see it.

Forms use a service-role server function so anonymous submitters can write without an account, while still respecting your form schema and column types.

### 3.7 Automations

From the board header → **Automations**.

1. **Create rule**: pick a **trigger** (currently: *Status changes to X* on a chosen status column).
2. **Add actions**, executed in order:
   - **Set status** — write a value to another status column.
   - **Notify** — post a message to the activity feed and to mentioned members.
3. **Save** — the rule becomes active immediately.
4. **Recent runs** panel shows the last executions (OK / Error) so you can debug.

Rules fire whenever an item value is changed in the UI, by a form submission, or by another automation.

### 3.8 Dashboards

Workspace sidebar → **Dashboards**.

- **Create dashboard**: name it. You can have multiple dashboards per workspace and switch via the picker.
- **Add widget**: click **+ Widget**. Pick a type:
  - **KPI count** — total items on a board (optionally filtered to one status value).
  - **Status breakdown** — bar/percentage breakdown across the options of a status column.
  - **Numbers sum** — sum of a numeric column on a board.
  - **Board link** — a card that deep-links to a board (useful as a launcher).
- Widgets auto-refresh every 30 seconds.
- Resize/reorder by dragging.

### 3.9 Notifications & activity

- The bell icon in the top bar shows mentions, assignment changes, and automation notifications.
- Each item's drawer carries its own per-item activity stream.

### 3.10 Keyboard shortcuts

| Key | Action |
|---|---|
| `/` | Focus global search |
| `c` | Create new item in the focused group |
| `Esc` | Close drawer / dialog |
| `Cmd/Ctrl + Enter` | Save a field while editing |

---

## Part 4 — Administration

### 4.1 Roles

Roles live in `public.user_roles` and are checked by the `public.has_role(uid, role)` security-definer function used in RLS policies. Available roles: `admin`, `moderator`, `user`. Grant/revoke with SQL:

```sql
insert into public.user_roles (user_id, role) values ('<uid>', 'admin');
delete from public.user_roles where user_id = '<uid>' and role = 'admin';
```

### 4.2 Backups

- Supabase Cloud: Database → Backups (daily on paid plans).
- Self-hosted: schedule `pg_dump` against your Postgres instance.

### 4.3 Updating

```bash
git pull
bun install
supabase db push     # apply any new migrations
bun run build
```

New migrations are additive and timestamped; never edit an applied migration — add a new one.

### 4.4 Troubleshooting

| Symptom | Fix |
|---|---|
| `permission denied for table ...` in the browser | A migration created a table without `GRANT`s. Add `GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table> TO authenticated;` in a new migration. |
| Public form returns 500 | `SUPABASE_SERVICE_ROLE_KEY` is missing in the server env. |
| "Unsupported provider: google" | Google provider not enabled in Supabase Auth settings. |
| Build fails with `Unauthorized` during prerender | A protected server function is being called from a public route loader. Move the call into a component using `useServerFn` + `useQuery`, or place the route under `_authenticated/`. |
| Automations don't fire | Check **Recent runs** on the Automations page for the error; common cause is a deleted status option that the rule still references. |

---

## Part 5 — Security notes

- Every public-schema table has RLS enabled. Policies are scoped to workspace membership via `has_role` or a `workspace_members` join — never to client-supplied IDs.
- The service role key is used only in server-side handlers (form submissions, automation execution, admin operations) and is never exposed to the browser.
- Public form endpoints validate input with Zod and write through a single allow-listed path; they cannot read or modify anything outside their target group.
- All auth flows use Supabase-issued JWTs in httpOnly-style storage handled by `@supabase/supabase-js`.

---

## Appendix — Tech stack

- **Front-end**: React 19, TanStack Router/Start v1, TanStack Query, Tailwind CSS v4, shadcn/ui, dnd-kit, Framer Motion.
- **Back-end**: Supabase (Postgres + Auth + Storage), TanStack Start server functions (`createServerFn`) on a serverless edge worker.
- **Build**: Vite 7, Bun.
- **Type safety**: TypeScript strict, Zod input validation on every server function.

