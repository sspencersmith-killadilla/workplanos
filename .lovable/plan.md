# Calendar view rebuild

Fix the "nothing showing up" bug and turn the calendar into a real production tool for tracking events.

## What you'll see

A single Calendar tab with three stacked sections:

```text
┌─────────────────────────────────────────────────────────────┐
│  ‹ June 2026 ›   Today     Color: % Sold ▾   Column: ...    │
├──────────────────────────────────┬──────────────────────────┤
│                                  │  Wed Jun 18              │
│       MONTH GRID                 │  ──────────────          │
│   (rich cells, heatmap dots)     │  Anime and Art           │
│                                  │  JJGL Meeting Room       │
│                                  │  Doors — • Show 21:00    │
│                                  │  ░░░░░░░░░░ 0 / — sold   │
│                                  │  [scheduled]  [Open]     │
├──────────────────────────────────┴──────────────────────────┤
│  TIMELINE (Gantt strip)                                     │
│  Venue A  ──█████──────────────────────                     │
│  Venue B  ─────────████──────────█████─                     │
└─────────────────────────────────────────────────────────────┘
```

## Fixes for "not populating"

1. **Smart default column** — pick the canonical `Event date` column first, then any other column titled "date", then the first `date`/`timeline` column. Persist the user's last pick per board in `localStorage` (`board:{boardId}:calCol`). Solves the silent-empty case where an older empty date column was being selected.
2. **Empty-state guidance** — when the chosen column has zero values across all items, show a hint: "No dates on this column. Switch to: Event date" with a one-click switch button.
3. **Naive ISO safety** — TESS sends `2026-06-18T21:00:00` (no zone). Parse via a tz-stable helper so events don't drift across midnight depending on browser locale.

## Visual rebuild

### Month grid (top, primary)
- Each cell shows up to 4 events as compact pills: title + tiny `% sold` bar at the bottom of the pill.
- Pill color comes from a **% sold heatmap** (green ≥80%, yellow 40–80%, red <40%, gray when capacity unknown).
- Hover a pill → tooltip with venue + doors/show times. Click → opens the existing item drawer.
- Overflow shows `+N` button that opens a popover listing the rest (no truncation by drawer width).
- Today cell + selected day cell get distinct outlines.

### Agenda panel (right side, collapsible)
- Shows the selected day (or selected week if no specific day).
- Each event row: title, venue + location, doors/show, status pill, % sold progress bar, assignee avatar, "Open in TESS" link.
- Quick filter chips at top: All / Scheduled / Confirmed / Cancelled (reads from Status column options).

### Timeline strip (bottom, toggleable)
- Lanes grouped by **Venue** (default), with a toggle to switch to **Assignee**.
- Horizontal bar per event spanning `starts_at`→`ends_at` (single-day events render as a centered dot+label).
- Same heatmap color rule as the month grid.
- Scrolls horizontally; sticky lane labels on the left. Today is a vertical accent line.

### Header controls
- Month nav (‹ Today ›), color-by selector (% Sold / Status / Venue / Assignee), date-column selector (only if >1 date column).
- Layout toggle: `Month` · `Month + Agenda` · `Month + Timeline` · `All`.

## Technical changes (for reference)

- **`src/components/board/views.tsx`** — replace `CalendarView` body. New helpers: `pickDefaultDateColumn(columns)`, `parseLooseDate(str)`, `eventColor({mode, item, values})`, `useStickyState(key, fallback)`.
- New components in the same file (kept colocated to match existing convention): `MonthGrid`, `AgendaPanel`, `TimelineStrip`, `EventPill`.
- No new dependencies — keep using `date-fns` already imported.
- No DB or server-function changes — purely a presentation refactor. TESS ingest stays as-is.
- No changes to `board-canvas.tsx` other than the existing `<CalendarView .../>` call site (still passes `items`, `columns`, `values`); the new layout toggles live inside the component.

## Out of scope

- Drag-to-reschedule (separate change — needs `onUpsertValue` plumbing and conflict rules).
- iCal/Google Calendar export.
- Resource-level conflict warnings (double-booked venues).
