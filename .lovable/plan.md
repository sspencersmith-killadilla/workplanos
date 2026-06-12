
# Completing the WorkPlanOS ↔ TESS round-trip

Today the bridge is **half-built**. TESS → WPO works end-to-end (signed webhook, upsert, idempotent). WPO → TESS only fires when an item value is changed *and* the item is already linked to a TESS event. TESS itself has no receiver, no outbound dispatcher, and no settings UI yet, so nothing actually comes back.

Below is everything that's left, split into "WPO side" (I'll build) and "TESS side" (prompts for you to paste into the TESS project).

---

## What's left on the WorkPlanOS side

1. **Board "Enable embed" toggle.** The embed route and token logic exist; there's no UI yet to turn it on per board or copy the iframe snippet.
2. **Outbound on item create + delete + title rename.** Right now only `upsertValue` pushes back. If you rename or delete a TESS-linked item in WPO, TESS never hears about it.
3. **Outbound on people / status changes specifically** — currently sent as generic `item.updated`. Add typed events (`item.status_changed`, `item.assignee_changed`) with the human-readable status label and assignee email so TESS doesn't have to look up internal IDs.
4. **Retry button + auto-retry timer** in the Integrations page for failed dispatches (`integration_dispatches.next_retry_at` is in the schema but unused).
5. **"Test connection" button** that POSTs a `ping` event to TESS using the saved base URL + secret, so you can confirm the wiring without creating a real event.
6. **Surface inbound failures too** — today the inbound webhook only writes `integration_dispatches` on errors; show "last successful inbound" timestamp on the settings page.
7. **Activity-feed entry on each sync** ("Synced from TESS · 2 min ago") inside the item drawer, so users see why a field changed under them.

---

## Prompts to paste into the TESS Lovable project

Paste these one at a time, in order. Each is self-contained.

### Prompt 1 — Database + settings UI in TESS

```text
Add a WorkPlanOS integration to this project.

1. New table public.workplanos_integration (org_id, wpo_base_url, wpo_workspace_id, shared_secret, enabled, created_by, timestamps). RLS: only org owners can read/write. GRANT to authenticated + service_role. Never return shared_secret to the client after creation — mask it as "abcd…wxyz".

2. New table public.event_external_refs (event_id PK, source='wpo', external_item_id, external_url, updated_at). Unique(source, external_item_id). RLS by org membership.

3. New table public.integration_dispatches (id, org_id, event_id, direction, payload jsonb, status_code, error, attempts, next_retry_at, created_at). RLS: org owners can read.

4. Settings page at /org/$orgId/integrations with a "WorkPlanOS" card:
   - Input: WPO base URL (default https://workplanos.lovable.app)
   - Input: WPO workspace ID (paste from WPO's Integrations page)
   - "Generate shared secret" button — shows the secret once, stores hash + plaintext server-side
   - "Rotate secret" + "Disable" buttons
   - Shows the inbound webhook URL TESS exposes:
     <origin>/api/public/integrations/wpo/inbound
   - Shows required headers TESS expects:
     x-wpo-workspace: <org_id>
     x-wpo-signature: sha256=<hmac of raw body using shared_secret>
   - Below the form: last 50 rows from integration_dispatches with timestamp, direction, status, error.

Only org owners can see or use this page.
```

### Prompt 2 — Inbound receiver in TESS (WPO → TESS)

```text
Create a server route at src/routes/api/public/integrations/wpo/inbound.ts (POST).

Behavior:
- Read raw body as text BEFORE parsing.
- Look up workplanos_integration by org_id from header x-wpo-workspace. 404 if not found or disabled.
- Verify x-wpo-signature header: compute HMAC-SHA256(rawBody, shared_secret), timing-safe compare against the "sha256=<hex>" value. 401 on mismatch. Use crypto.timingSafeEqual.
- Parse JSON body with Zod. Accepted shapes:
  { type: "ping" } → respond 200 { ok: true } and log a dispatch row with direction='inbound', status_code=200.
  { type: "item.updated" | "item.status_changed" | "item.assignee_changed",
    external_id: string,          // WPO item id
    title?: string,
    changes: { columnId?: string, text_value?: string, number_value?: number,
               date_value?: string, status_label?: string, assignee_email?: string } }
- Look up the matching event via event_external_refs where source='wpo' and external_item_id = body.external_id. If no match, write a dispatch row with error 'unlinked' and return 200 (so WPO doesn't retry forever).
- If matched: update the event row — map status_label to TESS's own status column, map assignee_email to a TESS user (match by email; null if no user). Write an activity-log row "Synced from WorkPlanOS".
- Log every call into integration_dispatches with direction='inbound', the parsed payload, the resulting status, and any error.

Use supabaseAdmin (service role) for the lookups and writes — this route runs without a user session.
```

### Prompt 3 — Outbound dispatcher in TESS (TESS → WPO)

```text
Whenever an event in TESS is created, updated, cancelled, or has its primary assignee changed, POST a signed webhook to WorkPlanOS.

Implementation:
- New helper notifyWorkPlanOS({ orgId, eventId, type }) called from existing event mutation server functions (createEvent, updateEvent, cancelEvent, assignGig).
- Inside the helper:
  1. Load the workplanos_integration row for orgId. Skip silently if disabled or missing.
  2. Load the event with its title, starts_at, venue, status label, and assignee email.
  3. Build body:
     {
       "type": "event.updated" | "event.created" | "event.cancelled" | "gig.assigned",
       "event": {
         "id": "<tess event id>",
         "title": "...",
         "starts_at": "<ISO>",
         "venue": "...",
         "status": "<human label>",
         "assignee_email": "..."
       }
     }
  4. Compute HMAC-SHA256(body, shared_secret) hex.
  5. POST to `${wpo_base_url}/api/public/integrations/tess/inbound` with headers:
       content-type: application/json
       x-tess-workspace: <wpo_workspace_id from integration row>
       x-tess-signature: sha256=<hex>
  6. Insert a row into integration_dispatches with direction='outbound', the payload, status_code, error, attempts=1.
- Wrap the whole thing in try/catch — a failed sync must never block the user's event save.
- Add a "Retry" button on the integrations page that re-runs failed outbound dispatches (status_code >= 400 OR error not null) one at a time.
```

### Prompt 4 — Embed the WPO board inside TESS

```text
On the event detail page in TESS, add a collapsible "Operations board" panel that embeds the linked WorkPlanOS board.

Behavior:
- The org's WorkPlanOS integration row stores the wpo_base_url and shared_secret. The board ID and embed token come from WPO (the user pastes them once into the event or org-wide).
- Add two fields to the events table: wpo_board_id (uuid) and wpo_embed_token (text). Editable only by org owners/admins.
- Render the iframe with sandbox="allow-scripts allow-same-origin" and referrerpolicy="no-referrer":
  <iframe
    src={`${wpo_base_url}/embed/b/${event.wpo_board_id}?token=${event.wpo_embed_token}`}
    className="w-full h-[600px] rounded-lg border"
  />
- Show a friendly empty state with setup instructions if either field is blank.
- The embed is read-only — make that explicit in the panel header ("Read-only view from WorkPlanOS").
```

### Prompt 5 — End-to-end smoke test in TESS

```text
Add a "Test connection" button to the WorkPlanOS integrations card.

When clicked, it should:
1. POST to <wpo_base_url>/api/public/integrations/tess/inbound with body { "type": "ping" }, properly signed.
2. Show the HTTP status and response body in a toast.
3. Log the result as an outbound dispatch.

Also surface "Last successful inbound" and "Last successful outbound" timestamps at the top of the card, pulled from integration_dispatches.
```

---

## How to run this

1. Let me know to proceed and I'll implement the seven WPO-side items above.
2. Open the TESS project and paste **Prompt 1**. Approve the migration.
3. Once the TESS integrations page exists, open it side-by-side with the WPO Integrations page and copy the workspace ID + secret between them.
4. Paste **Prompts 2 → 5** in TESS, in order, approving each.
5. Use the "Test connection" button (Prompt 5) and the WPO Integrations activity log to confirm both directions work.

---

## Technical notes (skip if non-technical)

- Both sides MUST read the raw request body **before** parsing JSON; HMAC must be computed over the exact bytes received, not a re-serialized object, or signatures will never match.
- Header names are case-insensitive in HTTP but the values are case-sensitive — use lowercase `sha256=<hex>` on both sides.
- Use `crypto.timingSafeEqual` for the signature compare; a plain `===` is a timing-oracle.
- Both `integration_dispatches` tables are intentionally write-heavy and never queried by the user-facing app outside the settings page — index on `(org_id, created_at desc)` (TESS) and `(workspace_id, created_at desc)` (WPO).
- The `ping` event type is a no-op on the WPO inbound route; I'll add a one-line handler when I do the WPO-side work so the TESS "Test connection" button has something to hit.
