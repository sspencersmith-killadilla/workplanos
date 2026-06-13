## Add board archive & delete UI

Backend already has `archiveBoard` and `deleteBoard` server fns plus `boards.archived_at` — this plan wires them into the UI.

### 1. Sidebar (`src/routes/_authenticated/w.$workspaceId.tsx`)
- Add a `…` dropdown (hover/focus reveal) on each board row with:
  - **Archive** / **Unarchive**
  - **Delete…** (owner/admin only, opens confirm dialog)
- Add a "Show archived" toggle at the bottom of the Boards section. Default hidden. When on, archived boards render below active ones, grayed out, with an Unarchive item in their menu.
- Filter active vs archived client-side from existing `listBoards` data using `archived_at`.

### 2. Board header (`src/routes/_authenticated/w.$workspaceId.b.$boardId.tsx`)
- Add a `…` menu in the board header with Archive / Unarchive and Delete.
- After archive or delete, navigate back to `/w/:workspaceId` and invalidate the `["boards", workspaceId]` query.

### 3. Delete confirmation dialog (type-the-name)
- Reusable `ConfirmDeleteDialog` (or inline in the board menu) that:
  - Shows the board name and a warning that items, columns, values, comments, automations, forms, and dashboards on this board will be permanently deleted.
  - Requires the user to type the exact board name into an input before the Delete button enables.
  - Destructive button variant; loading state while the mutation runs.

### 4. Permissions
- Archive: any workspace member with edit rights (existing RLS already enforces).
- Delete: owner/admin only. Hide Delete in the menu when the current user isn't owner/admin, and rely on RLS as the backstop.
- Reuse the workspace role already available via `workspace_members` (fetch current user's role once per workspace and gate menu items).

### Technical notes
- New mutations use `useServerFn(archiveBoard)` and `useServerFn(deleteBoard)`, with `onSuccess` invalidating `["boards", workspaceId]` and (for delete from the open board) navigating away first.
- No schema changes, no new server fns.
- Toasts on success/failure via existing `sonner`.

### Out of scope
- Bulk archive/delete.
- A dedicated archived-boards page (the sidebar toggle covers it).
- Soft-delete / trash with restore (delete is permanent; archive is the reversible option).
