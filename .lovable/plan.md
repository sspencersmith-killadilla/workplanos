## Goal

Give board owners/admins one place — a new **Customize** tab on each board — to configure KPIs, status options, external (non-member) assignees, and automations that fire on more than just status changes.

## 1. Board Customize page

New route: `src/routes/_authenticated/w.$workspaceId.b.$boardId.customize.tsx`, linked from the board header next to **Forms** and **Automations**. Visible only to workspace `owner`/`admin` (other members get a "view only" message). Four sections, each described below.

## 2. Status column customization (surfacing what already exists)

Status options already live in `board_columns.settings.options`, but they're only editable through ad-hoc drawer UI. The Customize page adds a dedicated editor:

- List every `kind:'status'` column on the board
- For each: rename column, add/remove options, edit option label + color (color picker), reorder by drag, set a "default" option
- Save via existing `updateColumn` server fn (no schema change)
- Warn before deleting an option that's in use; offer "move existing items to <other option>"

This is the "custom statuses" capability the user asked for, made discoverable.

## 3. KPI targets per board

New table `board_kpis`:

| field | type | notes |
| --- | --- | --- |
| id | uuid pk | |
| board_id | uuid fk → boards | cascade delete |
| name | text | e.g. "Tickets sold" |
| metric | text enum | `count_items` \| `sum_column` \| `avg_column` \| `count_with_status` |
| column_id | uuid nullable | required for sum/avg |
| status_column_id, status_option_id | uuid nullable | for count_with_status |
| target | numeric | the goal |
| unit | text nullable | e.g. "$", "tickets" |
| period | text enum | `all_time` \| `month` \| `quarter` \| `year` |
| position | int | |

RLS: workspace members read; owner/admin write. Standard `GRANT` block.

Customize page section "KPIs": list, add, edit, delete, drag-reorder. Each row shows live actual vs target with a progress bar (computed client-side from already-loaded items, no extra fetches for the basic metrics).

These KPIs are then available as a new **KPI card** widget on dashboards (`dashboard_widgets.kind = 'kpi'`, payload `{ board_kpi_id }`). Dashboard widget render is a thin addition to `dashboards.functions.ts` + existing dashboard renderer.

## 4. External assignees (non-members)

Problem: today the People column only picks workspace members.

Add table `board_external_assignees`:

| field | type |
| --- | --- |
| id | uuid pk |
| board_id | uuid fk |
| name | text |
| email | text nullable |
| avatar_url | text nullable |
| created_by | uuid |

RLS: workspace members read; owner/admin write. Standard GRANT block.

Customize page section "External people": CRUD list (name + optional email).

People column stores ids in `item_values.value_json` as an array. Extend the encoding to tagged entries: `{ kind: 'member', id }` or `{ kind: 'external', id }`. Migration: server fn that reads existing arrays of bare uuids continues to work (treated as `member`). `PeoplePicker` gets a second list ("External") below members, with an inline "+ Add external person" that opens a small dialog and refreshes. Notification trigger `notify_people_assignment` keeps working — it just skips `external` entries (no `auth.users` row to notify; optionally send to their email later, out of scope).

TESS outbound payload already sends `assignee_email`; we'll prefer member email, falling back to external email.

## 5. Broader automation triggers

Today `automation_rules.trigger` only supports `status_change`. Extend the discriminated union in `src/lib/automations.functions.ts`:

- `status_change` (existing)
- `item_created`
- `item_updated` — any column change on the board
- `column_changed` — specific `column_id` changed (any new value)
- `comment_added`
- `activity_added` — any `item_activity` row

Actions stay as they are (`set_status`, `notify`) plus a new `notify_people` action that pings the item's current People column assignees.

Trigger dispatch is server-side: a single `dispatchAutomations` helper in `automations.functions.ts` called by `updateItemValue`, `createItem`, `addComment`, and after `item_activity` inserts. No DB triggers — keeps it inside server functions where we already have auth context.

The Customize page section "Automations" reuses the existing Automations route's editor (just deep-links), so we don't duplicate UI; new trigger kinds appear in its dropdown.

## 6. Permissions

Every new write fn calls `has_ws_role(boardWorkspace, userId, ['owner','admin'])`. Reads scoped via existing `is_member`.

## Acceptance

1. Owner opens board → **Customize** → renames "Confirmed" status to "Locked in", changes its color → board reflects immediately.
2. Owner adds KPI "Tickets sold, target 500, sum of column Tickets sold" → KPI shows `342 / 500` with progress bar; adding the same KPI to a dashboard as a card renders the same value.
3. Owner adds external person "Jane Smith — jane@promoter.com" → People picker on any item shows her under "External"; assigning her does not crash notifications.
4. Owner creates automation: trigger `comment_added`, action `notify_people` → adding a comment notifies all assignees on that item.
5. Non-admin member opens Customize → sees read-only view, no save buttons.

## Out of scope (call out explicitly so they're not surprised)

- Emailing external assignees (we only store + display them).
- Custom item types / per-board templates.
- Branding (logo/colors) per workspace.
- KPI metrics that need cross-board joins.
