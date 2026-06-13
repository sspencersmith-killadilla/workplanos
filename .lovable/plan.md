## Goal

Make sub-items first-class on the board:
1. Render them inline, indented, directly under their parent row.
2. Give each one a checkbox to mark complete / incomplete, with the title struck through when done.

The drawer's Sub-items tab stays — it remains the place to add/remove and see activity — but the board itself becomes the primary surface for ticking things off.

## Changes

### 1. Schema — add a completion field
New migration adding `items.completed_at timestamptz null`.

- `null` = open, non-null = done (also gives us "who/when" for free later).
- No new table; sub-items are already `items` rows with `parent_item_id`.
- Backfill: none needed.
- RLS: existing `items` policies already cover it.

### 2. Server function — toggle completion
Add `setItemCompleted({ id, completed: boolean })` in `src/lib/boards.functions.ts`:
- Updates `completed_at` to `now()` or `null`.
- Writes an `item_activity` row (`kind: "completed"` / `"reopened"`) so the change shows in the parent's activity feed.
- Returns the new state.

### 3. Board canvas — render sub-items inline
File: `src/components/board/board-canvas.tsx`

- Stop filtering out `parent_item_id` rows.
- Group children under their parent: render parent row, then each child row immediately after, indented (e.g. 24px left padding + a small caret/└ glyph).
- Children render a slimmer row: checkbox + title only, no column values (sub-items don't carry column data today). This keeps the board readable and avoids implying sub-items have their own status/owner/etc.
- Add a per-parent collapse toggle (chevron on the parent row) with state persisted in `localStorage` keyed by board id, so long lists stay manageable. Default = expanded.
- Clicking the sub-item title still opens the drawer for that sub-item (same behaviour as a normal item click).

### 4. Checkbox behaviour
- Uses the existing `Checkbox` UI component.
- Optimistic toggle via TanStack Query `setQueryData`, then call `setItemCompleted`.
- When checked: title gets `line-through text-muted-foreground`.
- Available on the inline board row AND on each row in the drawer's Sub-items tab (replacing the decorative `Circle` icon).

### 5. Parent progress hint (small, optional)
On the parent row, show `2/5` next to the title when it has sub-items, where `2` is completed count. Pure read from already-loaded children — no extra query.

## Out of scope

- Sub-items with their own column values (status, owner, dates per sub-item). That's a much bigger change (sub-items would need to inherit or define their own columns) and isn't what you asked for.
- Auto-completing the parent when all sub-items are done.
- Drag-to-reorder sub-items on the board. Existing position field still works; reordering can stay in the drawer for now.

## Acceptance check

1. Open any item, add two sub-items in the drawer.
2. Close the drawer — both sub-items appear indented under the parent row on the board, with checkboxes.
3. Tick one on the board — title strikes through immediately, parent shows `1/2`.
4. Reload — state persists.
5. Collapse the parent — sub-items hide; expand — they return.
