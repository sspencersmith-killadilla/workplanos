## Goal

When TESS pushes an event, the linked WPO item should auto-populate:
- **Due date** ← event start
- **Owner** ← assigned TESS staff member
- **Link** ← deep link to the TESS event
- **Notes/Text** ← consolidated details (location, time, tickets available, tickets sold)

Yes — this is fully automatable. No manual workflow step. It needs (1) TESS to send the extra fields, (2) WPO to map them to the right columns by a stable convention.

## How mapping works today

WPO's inbound receiver matches by **column title (case-insensitive)** on the target board:
- `date` / `starts at` / `when` → date column
- `venue` / `location` → text column
- `status` → status column (option label match)
- `assignee` / `people` / `owner` → people column (by email)

There is no link column mapping, no "due date" alias, and no ticket fields in the payload.

## Changes needed

### 1. WPO inbound receiver — extend mapping
File: `src/routes/api/public/integrations/tess/inbound.ts`

- Accept new optional payload fields on `event`:
  - `ends_at`, `doors_at` (ISO)
  - `tickets_available` (number), `tickets_sold` (number)
  - `notes` (string, freeform)
- Title aliases to recognise:
  - Date column: also match `due date`, `due`, `event date`
  - Link column (kind `link` or `url` or text fallback): match `link`, `tess link`, `event link`, `url`
  - Notes column (kind `long_text` or `text`): match `notes`, `details`, `info`
- New behaviour:
  - Write `event.url` into the link column.
  - Build a notes block from whatever fields are present and write it into the notes column, replacing any prior auto-block delimited by `<!-- tess:auto -->` markers so manual notes above/below are preserved.
  - Owner: keep the existing email→profile match for the people column.

### 2. TESS outbound dispatcher — send the extra fields
TESS must include the new fields in its POST body. Paste this into TESS:

> Extend `dispatchToWpo` so the `event` object in the JSON body includes, when available:
> `starts_at`, `ends_at`, `doors_at`, `venue`, `status`, `assignee_email` (the assigned staff member's email), `tickets_available`, `tickets_sold`, `notes`, and `url` (deep link to the TESS event page, e.g. `${TESS_PUBLIC_URL}/events/${event.id}`). Pull `tickets_available` / `tickets_sold` from whatever table holds ticket inventory for that event. Send `null` rather than omitting a field when a value is genuinely empty — that lets the receiver clear stale values.

### 3. WPO board setup (one-time, per board)
For each board you connect to TESS, make sure the columns exist with these exact titles (case-insensitive) — this is the only "workflow" part, and it's a 30-second setup:
- `Due date` — date column
- `Owner` — people column
- `Link` — link column (or text)
- `Notes` — long text column

If a column doesn't exist on the board, the receiver silently skips that field — no error, just nothing populates. That's the #1 cause of "it's connected but fields are blank."

## Notes panel format

The Notes column will be written as:
```text
<!-- tess:auto -->
Location: Brixton Academy
Doors: 19:00
Show: 20:00 – 22:30
Tickets: 1,420 / 2,000 sold
<!-- /tess:auto -->
```
Anything outside those markers is left untouched on update.

## What changes in WPO vs TESS

| Concern | Where |
|---|---|
| Payload shape (send more fields) | TESS (`dispatchToWpo` / `wpo-dispatch.server.ts`) |
| Field-to-column mapping & notes block | WPO (`inbound.ts`) |
| Board column titles | WPO board setup (manual, one-time) |

## Acceptance check

1. Add the columns on a test board.
2. In TESS, edit an event's date/venue/tickets/assignee.
3. Within seconds the WPO item shows: Due date set, Owner avatar set, Link clickable to TESS, Notes block with location + times + ticket counts.
4. Edit notes manually above the auto-block in WPO → next TESS update only rewrites the auto-block, leaving your manual notes intact.