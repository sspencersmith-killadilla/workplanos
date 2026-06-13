## Workspace Settings page

Wire the dead sidebar gear to a real settings page at `/w/:workspaceId/settings`.

### 1. Route — `src/routes/_authenticated/w.$workspaceId.settings.tsx`
Tabbed layout with:

**General**
- Edit workspace **name** (inline save).
- Edit **color** (swatch picker, same palette as elsewhere).
- Read-only **slug** and creation date (slug change is out of scope — it would break invite links and bookmarks).
- Quick links to **Members** and **Integrations** pages.

**Danger zone** (owner only)
- **Delete workspace** — type-the-name confirm via the existing `ConfirmDeleteDialog`. Permanently deletes the workspace and all boards/items/etc. (cascades through existing FKs).
- After deletion, navigate to `/app` and invalidate `["workspaces"]`.

### 2. Sidebar gear (`w.$workspaceId.tsx`)
- Replace the no-op `<button>` with a `<Link to="/w/$workspaceId/settings">` that shows active state when on the settings page (matches the existing Dashboards/Members/Integrations pattern).

### 3. Server functions (`src/lib/workspaces.functions.ts`)
- `updateWorkspace({ id, name?, color? })` — uses `requireSupabaseAuth`; RLS already restricts update to admins/owners.
- `deleteWorkspace({ id })` — uses `requireSupabaseAuth`; guard inside the handler: only the workspace `owner_id` may delete (extra safety on top of RLS). Relies on existing cascade FKs.

### 4. Permissions in UI
- Reuse `getMyWorkspaceRole` (already added) to gate which controls are visible:
  - Name/color edit: owner or admin.
  - Delete workspace: owner only.
- Non-privileged members see a read-only General view (name, color swatch, slug) and no Danger zone.

### Out of scope
- Renaming the slug.
- Transferring ownership.
- Workspace-level notification or branding settings.
- A separate archive-workspace flow (delete is the single destructive action).
