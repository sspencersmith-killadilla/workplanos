## Goal

Connect WorkPlanOS (WPO) and Total Event System Solutions (TESS) so that:
1. TESS events/gigs flow into a chosen WPO board as items, in real time.
2. Status / assignment changes on the WPO item flow back to the matching TESS event.
3. WPO boards can be embedded inside the TESS staff portal (read-only iframe view scoped to one board).

The two apps are separate Lovable projects with separate databases and auth, so this is an **integration**, not a merge. The bridge is signed webhooks + a shared external_ref on each side.

---

## 1. Connection model (in WorkPlanOS)

New table `public.workspace_integrations` to store one TESS connection per workspace:
- `workspace_id`, `kind = 'tess'`, `target_board_id`, `tess_base_url`, `tess_workspace_id` (or org id in TESS), `shared_secret` (random, server-generated), `enabled`, timestamps.

RLS: workspace owners/admins can read/manage; service_role full access. The `shared_secret` is never returned to the client after creation — only shown once on creation, then masked.

UI: new tab on the workspace settings (or under the board settings) "Integrations → Total Event System Solutions" with:
- Pick a board to receive events.
- Generate shared secret (shown once).
- Webhook URL to paste into TESS: `https://workplanos.lovable.app/api/public/integrations/tess/inbound`.
- Toggle enabled.

Each synced item gets an `external_ref` row (new small table `public.item_external_refs`: item_id, source='tess', external_id, external_kind, external_url, updated_at, unique on (source, external_id)) so we can find/update existing items on repeat webhooks instead of duplicating.

## 2. Inbound: TESS → WorkPlanOS (real time)

Server route `src/routes/api/public/integrations/tess/inbound.ts` (POST):
- Verify `X-TESS-Signature` (HMAC-SHA256 of raw body using the workspace's `shared_secret`, timing-safe compare). Header `X-TESS-Workspace` identifies which WPO workspace integration to look up.
- Validate body with Zod. Supported event types: `event.created`, `event.updated`, `event.cancelled`, `gig.assigned`.
- Load admin client inside the handler; upsert into `items` on the configured `target_board_id`, keyed by `item_external_refs(source='tess', external_id=<tess id>)`.
- Map TESS fields to board columns by name (Title, Date, Venue, Status, Assignee). If a column doesn't exist we skip that field rather than fail.
- Write an `item_activity` row noting "Synced from TESS".

Idempotent: re-delivering the same payload upserts the same item.

## 3. Outbound: WorkPlanOS → TESS (real time)

A small dispatcher triggered when an item that has a TESS `external_ref` changes:
- Implemented as a server fn `notifyExternalChange({ itemId })` called from existing mutation paths (`updateItemValue`, status changes, people assignment) when `item_external_refs` has a row for that item.
- POSTs to `<tess_base_url>/api/public/integrations/wpo/inbound` with HMAC-signed body containing the external_id, changed columns, and new values.
- Failures are logged into a new `public.integration_dispatches` table (item_id, payload, status_code, error, attempts, next_retry_at) so the UI can show a "last sync" indicator and retry. A simple retry pass runs from a server fn invoked on demand (no cron added in this pass — note this below).

TESS side will need a mirror inbound route. That work lives in the TESS project and is out of scope for this plan, but the contract (URL, headers, JSON shape) is documented in WPO's integration settings page so it can be implemented there next.

## 4. Embeddable board view

New public route `src/routes/embed.b.$boardId.tsx`:
- Read-only board view (no sidebar, no chrome) styled to drop into an iframe.
- Auth: requires `?token=<embed_token>` query param. New column `embed_token` on `boards` (nullable, randomly generated when embedding is enabled from board settings). Token grants read-only access to that board's items and columns through a dedicated server fn that bypasses RLS via `supabaseAdmin` after verifying the token.
- `X-Frame-Options` removed for this route; CSP `frame-ancestors` set to the TESS production + preview hosts only.

TESS staff portal can drop this in as `<iframe src="https://workplanos.lovable.app/embed/b/<id>?token=...">`.

## 5. Limits / things we are explicitly NOT doing in this pass

- No shared single sign-on. Each app keeps its own users; assignee mapping is by email (TESS sends `assignee_email`, WPO matches to a workspace member by email).
- No scheduled reconciliation cron. Retries are on-demand from the integration settings page.
- No bidirectional comment sync.
- TESS-side webhook receiver is documented but not built here.

---

## Technical details

**New tables (WPO):**
- `workspace_integrations` (workspace_id, kind, target_board_id, tess_base_url, tess_workspace_id, shared_secret, enabled, created_by)
- `item_external_refs` (item_id PK, source, external_id, external_kind, external_url) — unique(source, external_id)
- `integration_dispatches` (id, item_id, direction, payload, status_code, error, attempts, next_retry_at)
- `boards.embed_token` column

All with GRANTs to authenticated + service_role, RLS scoped to workspace membership / owner role for the secret column.

**New routes/files (WPO):**
- `src/routes/api/public/integrations/tess/inbound.ts` — HMAC-verified webhook receiver.
- `src/routes/embed.b.$boardId.tsx` — read-only embed.
- `src/lib/integrations.functions.ts` — listIntegrations, createTessIntegration, rotateSecret, listDispatches, retryDispatch, enableEmbed.
- `src/components/integrations/tess-settings.tsx` — settings UI.
- Hook outbound dispatch into existing `items.functions.ts` / `item_values` mutations.

**Webhook payload shape (TESS → WPO):**
```text
POST /api/public/integrations/tess/inbound
Headers: X-TESS-Workspace: <wpo-workspace-uuid>
         X-TESS-Signature: sha256=<hex hmac of raw body>
Body:    { "type": "event.updated",
           "event": { "id": "...", "title": "...", "starts_at": "...",
                      "venue": "...", "status": "confirmed",
                      "assignee_email": "..." } }
```

**Failure modes handled:**
- Bad signature → 401, no DB write.
- Unknown workspace or disabled integration → 404.
- Schema mismatch (missing board columns) → write what we can, log the rest into `item_activity`.
- TESS unreachable on outbound → row in `integration_dispatches` with `next_retry_at`.

## Open question

Should the WPO embed view in TESS allow staff to **update item status** (e.g. mark a task Done) without leaving TESS, or stay strictly read-only in v1? Read-only is faster and safer; interactive needs a per-user embed token tied to a real WPO account.
