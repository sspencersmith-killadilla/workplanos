## Status

WPO is fully wired. The TESS side currently only has the settings page (Prompt 1). The "Test connection" succeeds because that's just a signed POST hitting WPO's receiver — it doesn't exercise real sync. To get actual two-way updates, paste **Prompt 2** then **Prompt 3** into TESS, in order.

## Prompt 2 — TESS inbound receiver (WPO → TESS)

Paste this into TESS:

> Build a public webhook receiver at `POST /api/public/integrations/wpo/inbound` so WorkPlanOS can push event/item updates into TESS.
>
> **Requirements:**
> 1. Read raw request body as text before parsing.
> 2. Headers: `x-wpo-department` (the TESS workspace/department UUID configured in our `wpo_integration` settings), `x-wpo-signature` in the form `sha256=<hex hmac>`. Look up the integration row by `x-wpo-department`. Return 404 if not found or disabled.
> 3. Verify the signature: HMAC-SHA256 of the raw body using the integration's shared secret. Use `timingSafeEqual`. Return 401 on mismatch.
> 4. Body shape (JSON):
>    ```json
>    {
>      "type": "item.updated" | "item.status_changed" | "item.assignee_changed" | "item.renamed" | "item.deleted" | "ping",
>      "item": {
>        "id": "uuid",           // WPO item id — use as external ref
>        "title": "string",
>        "status": "string",     // e.g. "Confirmed"
>        "assignee_email": "string",
>        "starts_at": "ISO date",
>        "venue": "string",
>        "url": "string"         // deep link back to WPO item
>      }
>    }
>    ```
>    If `type === "ping"`, log it and return `{ ok: true, pong: true }` — no DB writes.
> 5. Maintain an `event_external_refs` table: `(event_id, source='wpo', external_id, external_url)`. Look up by `(source, external_id=item.id)`.
>    - If no ref and `type !== "item.deleted"`: create a new TESS event from the payload, then insert the ref.
>    - If ref exists: update the linked event's title/status/assignee/date/venue from non-null payload fields.
>    - If `type === "item.deleted"` and ref exists: soft-delete or cancel the TESS event.
> 6. Map `assignee_email` to a TESS user by case-insensitive email match; skip if no match.
> 7. Insert a log row in a `wpo_dispatches` table with `direction='inbound'`, status_code 200, and the parsed payload — mirrors what WPO does on its side.
> 8. Return `Response.json({ ok: true, event_id })` on success.

## Prompt 3 — TESS outbound dispatcher (TESS → WPO)

Paste this into TESS after Prompt 2 is approved:

> When a TESS event is created, updated (title/status/date/venue/assignee), or cancelled, push the change to WorkPlanOS.
>
> **Requirements:**
> 1. Create a server helper `dispatchToWpo({ eventId, type, body })` modeled on the inbound receiver in reverse.
> 2. Read the `wpo_integration` row for the event's department. If `enabled=false`, or `wpo_base_url` / `shared_secret` is missing, return `{ skipped: true }`.
> 3. POST to `${wpo_base_url}/api/public/integrations/tess/inbound` with:
>    - `Content-Type: application/json`
>    - `x-tess-workspace: <wpo_workspace_id from the integration row>` (this is the WPO workspace UUID, **not** the TESS department id)
>    - `x-tess-signature: sha256=<hmac of raw body using shared_secret>`
> 4. Body shape (must match what WPO expects):
>    ```json
>    {
>      "type": "event.created" | "event.updated" | "event.cancelled" | "gig.assigned",
>      "event": {
>        "id": "tess-event-uuid",
>        "title": "string",
>        "starts_at": "ISO date",
>        "venue": "string",
>        "status": "string",
>        "assignee_email": "string",
>        "url": "deep link back to TESS"
>      }
>    }
>    ```
> 5. Log every attempt to `wpo_dispatches` with `direction='outbound'`, `status_code`, `error`, and `attempts`. On failure, set `next_retry_at = now() + 5 minutes`.
> 6. Fire `dispatchToWpo` from triggers/hooks on event insert and update. Wrap in try/catch — outbound sync must never block the user's primary action.
> 7. Add a **"Resend to WorkPlanOS"** button on each event detail page that calls `dispatchToWpo({ type: "event.updated" })` for manual retries.
> 8. Add a small **Recent sync activity** panel on the Integrations settings page listing the last 50 `wpo_dispatches` rows, with a Retry button for failed outbound rows.

## After both prompts run

1. In TESS, create a new event → it should appear in your WPO board within seconds (Recent sync activity shows `inbound 200` on WPO).
2. In WPO, change that item's Status → TESS event status should update (WPO's Recent sync activity shows `outbound 200`).
3. If anything 401s, the shared secret drifted — rotate on one side and paste into the other.

## Notes for the technically curious

- The header asymmetry is intentional: WPO identifies itself by department UUID (TESS owns that), and TESS identifies itself by workspace UUID (WPO owns that). Each side uses the identifier its peer assigned it.
- The `target_board_id` on WPO and the equivalent "default event series/list" on TESS are what determine where new items land when the other side creates something new.
- No WPO code changes are required. After TESS ships Prompts 2 and 3, sync starts working automatically.
