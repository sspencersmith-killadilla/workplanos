# Improve TESS → WorkPlanOS sync

Right now the inbound webhook only fills columns that already exist on the target board, and drops everything else into a "notes" auto-block. We'll make it self-provisioning: it creates the right columns, sorts events into monthly groups, and backfills anything that arrived before today.

## What changes for you

1. The TESS inbound feed will auto-create any missing columns on the target board: **Event date, Doors, Show time, Venue, Status, Assignee, Tickets sold, Tickets available, % Sold, TESS Link, Notes**.
2. Every event will land in a group named after its month (e.g. **June 2026, July 2026**). New months are created on the fly; events that move to a different month are moved to the right group.
3. Status options on the Status column will be auto-created with colors the first time we see a new status from TESS.
4. % Sold is computed (sold / available × 100) and stored as a number so it can drive KPIs and dashboard widgets.
5. A one-time backfill, run when this ships, replays the last known payload for every TESS-linked item into the new columns/groups.

## What stays the same

- The Notes column still keeps its `<!-- tess:auto -->` block so anything you type outside the markers is preserved.
- Manual columns you've added on the board are untouched.
- The existing HMAC signature check, dispatch logging, and outbound sync are unchanged.

## Technical details

### 1. Schema-aware ingestion (`src/routes/api/public/integrations/tess/inbound.ts`)

- Replace the "match by title" lookup with an `ensureColumn(boardId, key)` helper that:
  - Looks up by canonical title (case-insensitive).
  - If missing, inserts into `board_columns` with the correct `kind` and `settings`, appending to `position`.
- Canonical column map:

  ```text
  Event date        date
  Doors             text   (HH:MM)
  Show time         text   (HH:MM-HH:MM)
  Venue             text
  Status            status (auto-add option on first sight, rotating palette)
  Assignee          people
  Tickets sold      number
  Tickets available number
  % Sold            number  (computed)
  TESS Link         link
  Notes             text   (preserves auto-block)
  ```
- For status: if the incoming `ev.status` doesn't match an existing option label, append a new option (id = `crypto.randomUUID()`, color from a fixed 8-color palette keyed by hash of label) into `settings.options`, then set it on the item.

### 2. Monthly grouping

- New helper `ensureMonthGroup(boardId, dateIso)`:
  - Group name = `Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(date)`.
  - If not present, insert into `groups` with a deterministic color (palette indexed by month) and `position = yyyymm`.
- On `event.created`/`updated`, compute the target group from `ev.starts_at` and `UPDATE items SET group_id = ...` if it differs.
- Events with no `starts_at` go to a fallback `"Unscheduled"` group.

### 3. Expanded payload schema

Extend `payloadSchema.event` to also accept (all optional): `genre`, `promoter`, `support_acts` (string), `settlement_total` (number), `currency`. These won't auto-create columns in v1 — they'll be appended into the Notes auto-block under labeled lines so the data isn't lost. (We can promote any of them to dedicated columns later if you want.)

### 4. Backfill

- New `createServerFn` `backfillTessBoard({ workspaceId })` (owner-gated):
  - For each `item_external_refs` row with `source='tess'` on this workspace's TESS board, fetch the most recent `integration_dispatches` row with `direction='inbound'` and `payload.event.id = external_id`.
  - Re-run the same ingestion routine against it (idempotent — uses upsert on `item_values`, won't duplicate groups/columns).
- Surface a "Backfill from TESS" button in `src/routes/_authenticated/w.$workspaceId.integrations.tsx` next to "Send test ping".

### 5. Tests / verification

- Hit the published inbound endpoint with `stack_modern--invoke-server-function` using a synthetic payload covering: brand-new event (creates columns, group, status option), updated event (moves month group), event with all tickets fields (verifies % sold).
- Inspect `board_columns`, `groups`, `item_values` rows for the test event via `supabase--read_query`.

## Out of scope

- New column kinds for genre/promoter/settlement (kept in Notes for now).
- Two-way sync of the new fields back to TESS (outbound payload shape unchanged).
- UI for remapping TESS field → column (the canonical map is hard-coded for v1).

## Files touched

- `src/routes/api/public/integrations/tess/inbound.ts` — schema, ensureColumn, ensureMonthGroup, status-option auto-add, expanded payload.
- `src/lib/integrations.functions.ts` — add `backfillTessBoard` server fn.
- `src/routes/_authenticated/w.$workspaceId.integrations.tsx` — add Backfill button.

No migration required — uses existing `board_columns`, `groups`, `item_values`, `item_external_refs`, `integration_dispatches` tables.
