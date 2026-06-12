## 1. Rename WorkOS → WorkPlanOS

Replace every "WorkOS" string (brand name, page titles, meta descriptions, OG tags, testimonial copy) across the app. Files touched:
- `src/routes/index.tsx` (header, meta, footer)
- `src/routes/auth.tsx` (left panel branding, meta)
- `src/routes/_authenticated/app.tsx` (header)
- `src/routes/_authenticated/w.$workspaceId.tsx` (any header refs)
- `public/USER_GUIDE.md`, `public/DEPLOY.md`, `README.md`
- Any remaining mentions found by a final grep

The single-letter "W" logo block stays (still works for WorkPlanOS).

## 2. Make the Account page easy to reach

Today `/account` exists but is only linked from the workspace shell. I'll:
- Add an **Account** link (and Sign out) to the header on `/app` (the workspaces list page), so it's reachable before entering a workspace.
- Also expose it on the landing header when signed in (optional — say if you'd rather keep landing logged-out only).

## 3. Fix "can't create new workspaces"

Database policies look correct (`owner_id = auth.uid()` insert, owner auto-added as member via trigger). Likely causes:
- You were signed out (you're currently on `/auth`) — sign in first.
- Your profile or membership has the lockdown `is_locked` flag set from earlier admin testing.

I'll:
- Verify your `ssm***@mckinneytexas.org` profile and `user_roles` row, and clear any `is_locked` flag if present.
- Add a visible error toast on the create-workspace dialog showing the real DB error (currently it just says "Could not create workspace"), so future failures are diagnosable.

If after sign-in it still fails, please paste the toast/error text.

## 4. Online user manual (in-app)

Today the manual is a raw `.md` file served from `/USER_GUIDE.md`. I'll build a proper in-app help center:
- New route `/help` (public) with a left-side table of contents and styled article body.
- New route `/help/$topic` for each section (Getting started, Workspaces, Boards & items, Views, Forms, Automations, Dashboards, Members & roles, Account).
- Written for non-technical users with screenshots-free, plain-language steps.
- Linked from: landing footer ("User manual"), app header ("Help"), and account page.
- The existing `/USER_GUIDE.md` (technical/self-host) stays for admins; footer keeps both links.

## 5. Replace testimonial quotes with tips & tricks

- `src/routes/auth.tsx` left panel: replace the blockquote with a rotating "Tip of the day" card (e.g. "Press ⌘K to jump to any board", "Drag a column header to reorder", "Use Forms to let non-members submit work").
- Landing page has no quote currently — I'll add a "Tips & tricks" strip above the footer with 3–4 short tips instead of adding a testimonials section.

## Clarifying question

For the user manual, do you want me to:
- **A)** Author the content myself based on what the app actually does (recommended, ~8 short articles), or
- **B)** Just port your existing `USER_GUIDE.md` content into the styled in-app pages verbatim?

I'll proceed with **A** unless you say otherwise.
