
# Make WorkPlanOS multi-tenant (City → Departments)

## Today's model

A `workspace` is currently the only isolation boundary. Anyone with a Lovable login can create one, become its owner, and invite others. Every user can see every workspace they belong to in one global app. There's no concept of "this workspace belongs to the City of X" — boundaries, branding, billing, and admin are all per-workspace.

That works for a single org with a few teams. For "City of X with 20+ departments" it breaks down: no central IT admin, no shared user directory, no enforced email-domain rules, no per-city branding, no per-city billing, and no way to stop Department A from inviting random outsiders.

## Target model

Introduce a new top-level entity — **Organization** (City) — that owns many **Workspaces** (Departments).

```text
Organization (City of Springfield)
├── Org admins (city IT, CIO)
├── Org-wide directory (users provisioned via SSO)
├── Org settings: domain, branding, SSO, billing, retention
└── Workspaces
    ├── Parks & Rec        (dept admin + members)
    ├── Public Works       (dept admin + members)
    └── Police Records     (dept admin + members, stricter policies)
```

Each request is scoped: a user can only reach workspaces inside an organization they belong to, and a department admin can never see another department's data.

## What it would take

### 1. Data model
- New `organizations` table (name, slug, primary domain, branding, plan, settings).
- New `organization_members` table with roles: `org_owner`, `org_admin`, `org_billing`, `org_member`.
- Add `organization_id` to `workspaces` (NOT NULL after backfill) and to anything that needs org-level rollups (`workspace_invites`, `workspace_integrations`, `dashboards`, optionally `audit_log`).
- New `org_domains` table — verified email domains that auto-place new users into the org.
- New `audit_log` table at org scope (who did what, when, where) — required for any government deployment.

### 2. Access control (RLS)
- New SECURITY DEFINER helpers: `org_for_workspace(_ws)`, `is_org_member(_org, _user)`, `has_org_role(_org, _user, _roles[])`.
- Rewrite workspace-membership policies so the org boundary is checked first: you can only be a member of a workspace if you're a member of its org.
- Cross-org data leakage tests: existing policies that join via `workspace_members` need to also confirm same-org, because today nothing stops two orgs from sharing a user who could be added to both.
- Lock down workspace creation: only `org_admin`/`org_owner` can create a workspace inside an org (today anyone can spin one up).

### 3. Identity & SSO
- Per-org SSO (SAML/OIDC) so the city's IdP (Entra/Okta/Google Workspace) is the source of truth for who exists.
- Email-domain claim: anyone signing up with `@springfieldcity.gov` lands in that org automatically and cannot self-create a competing org.
- Just-in-time provisioning + SCIM-style deprovisioning so leaving the city revokes access everywhere at once.
- Disable public signup for org-claimed domains.

### 4. Admin surface
- `/org/:slug` console for org admins: members, workspaces, domains, SSO config, audit log, billing, branding, retention/legal-hold policies.
- Org-level "create department" flow that provisions a workspace with the right defaults and pre-seeded admin.
- Cross-workspace member management (lock/unlock a user across every department in one action).
- Today's `/admin` (super admin) stays but becomes Lovable-operator scope; org admins get their own console.

### 5. Branding & UX
- Per-org logo, color, app name, and login screen.
- Workspace switcher becomes two-level: Org → Department.
- Routes shift from `/w/:workspaceId/...` to `/o/:orgSlug/w/:workspaceSlug/...` (or keep IDs but add org context everywhere) so URLs are shareable and scoped.

### 6. Integrations, billing, compliance
- TESS and any future integrations move to org-scoped credentials with per-workspace overrides, so the city configures once.
- Billing/seat counts roll up to the org; departments don't each manage a plan.
- Data retention, export, and deletion run at org scope (GDPR/records-request friendly).
- Audit log + IP allowlist + session timeout are org-level policies.

### 7. Migration of existing data
- Create a default `organizations` row per current workspace owner (or one "Personal" org per user) and backfill `workspace_id → organization_id`.
- Backfill `organization_members` from the union of all workspace members under each org.
- Run in a single transaction, then flip the column to NOT NULL and add the FK.

## Effort, roughly

- Schema + RLS + backfill migration: ~1–2 days.
- Org admin console (members, workspaces, domains, audit log skeleton): ~3–5 days.
- SAML/OIDC SSO + domain claim + JIT provisioning: ~1 week (depends on which IdPs you must support).
- Branding, routing changes, switcher UX: ~2–3 days.
- Billing rollup, retention policies, IP allowlist, full audit log: another ~1 week.

Minimum viable "city with departments" (schema + RLS + admin console + domain-based auto-join, no SSO yet): ~1 week. Government-grade (SSO, audit, retention, IP rules): ~3–4 weeks.

## Open questions before I plan the build

1. Is each city a **separate database/project** (hard isolation, separate billing, separate URL) or **one app with many orgs** (soft isolation via RLS, single URL, central operator)? Both are viable; they imply very different work.
2. Do you need **SSO (SAML/OIDC)** in v1, or is "email domain auto-join + invites" enough to start?
3. Should department admins be able to **create new departments themselves**, or only city/org admins?
4. Is there a **cross-department visibility** use case (e.g. a city-wide dashboard the mayor sees), or is hard isolation between departments the rule?
