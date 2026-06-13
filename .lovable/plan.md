
# Plan: Move items via DnD + end-to-end automation test

## Part 1 — Drag-and-drop items between groups

Today there is no UI to move an item to another group; the server fn exists but isn't wired. Add row-level drag-and-drop using `@dnd-kit` (matches the rest of the ecosystem, keyboard-accessible, works with virtualized lists).

### Behavior

- Each item row in the table view becomes draggable via a small grip handle in the left "row actions" cell (the same spot that already hosts the kebab on hover). Whole-row dragging is too easy to trigger by accident when users are selecting cells.
- Drop targets:
  - **Another group's row area** → moves the item to the end of that group.
  - **A specific row inside any group** → inserts before that row (reorders within or across groups).
- Subitems are not draggable across groups in this pass (they stay tied to their parent). Reordering subitems is also out of scope.
- Visual feedback: dragged row shows a translucent overlay; hovered group header highlights; insertion line shows between rows.
- Optimistic update with rollback on server error; toast on failure.

### Technical changes

- `bun add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`
- `src/components/board/board-canvas.tsx`
  - Wrap the groups list in `<DndContext>` with `onDragEnd`.
  - In `GroupSection`, make each `<tr>` a `useSortable` item keyed by `item.id`, and make the group container a droppable (`useDroppable` with id `group:<id>`).
  - Compute new `position` for the moved item:
    - Within-group reorder → midpoint between neighbors' positions.
    - Cross-group move with no specific row → max(position) + 1024 of target group.
  - Call existing `updateItem({ id, groupId, position })` — already supported in `src/lib/boards.functions.ts`.
  - Optimistically update the local `items` array before the server round-trip; on error, invalidate to roll back.
- No DB or server-fn changes; no automation changes.

```text
┌─ Group A ───────────────────┐
│ ⋮⋮  Row 1                    │  ← grab handle ⋮⋮ in left gutter
│ ⋮⋮  Row 2  ◄── dragging      │
│ ─────────── insertion line ─ │
│ ⋮⋮  Row 3                    │
└─────────────────────────────┘
```

### Out of scope (DnD)

- Kanban/board view DnD between status columns (separate change).
- Subitem reordering or re-parenting.
- Multi-select drag.

## Part 2 — End-to-end automation test

Drive the preview browser to exercise all three trigger/action combos against a real board. Uses the currently signed-in preview user, so all changes happen in their workspace; I'll create a throwaway board named `Automation Test <timestamp>` and delete it at the end so live data isn't touched.

### Test matrix

For each rule I'll: create the rule via the Automations page, fire the trigger via the board UI, then verify the side effect (status flipped, inbox bell badge increments, or assignee gets a notification row) before moving on.

| # | Trigger | Action | Verification |
|---|---|---|---|
| 1 | `status_change` on a Status column option | `set_status` on a second Status column | The second column's cell flips to the configured option within ~1s. Also check `automation_runs` shows `status=ok`. |
| 2 | `item_created` | `notify` (message: "Test 2") | InboxBell badge increments; clicking shows the notification with the right item link. |
| 3 | `column_changed` on a People column | `notify_people` (message: "Test 3") | Assigned user receives a notification; actor (self) does not. To verify the "not self" branch I'll assign a second workspace member; if none exists I'll note the limitation in the report. |

### Procedure

1. `browser--view_preview` → land on `/app`, pick the test workspace.
2. Create board `Automation Test <ts>`; add columns: `Status A` (Status), `Status B` (Status), `Owner` (People).
3. Open Automations tab, create rule 1, return to board, trigger, verify.
4. Repeat for rules 2 and 3.
5. Capture a screenshot per verification and a short pass/fail table in the final reply.
6. Delete the test board.

### What I'll report

- Pass/fail for each rule with the observed behavior.
- Any latency surprises (the dispatcher runs inline in the request, so it should be synchronous).
- Any code-level bugs I notice while reading `dispatchAutomations` along the way (e.g. `notify_people` currently only inspects existing values, not the just-changed value — worth flagging even if the test passes).

### Out of scope (test)

- Load / concurrency testing.
- Editing the existing automations UI.
- Fixing any bugs uncovered — I'll report and propose a follow-up plan.

## Order of execution

1. Implement DnD (Part 1) and verify it visually in the preview.
2. Run the automation test (Part 2) against the same preview session.
