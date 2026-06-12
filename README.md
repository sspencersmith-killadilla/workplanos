# WorkBoard

A workspace-based work-management platform with boards, items, views, forms, automations and dashboards.

## Quick Links

| Document | Description |
|----------|-------------|
| [User Guide & Self-Deploy Manual](./USER_GUIDE.md) | Complete guide for end-users and administrators, including self-hosted installation instructions |
| [Self-Hosting Guide](./DEPLOY.md) | Concise walkthrough: env vars, migrations, OAuth, build & deploy |

## What's Inside the Guide

- **Installation** — Prerequisites, cloning, Supabase setup, environment variables, and running locally or in production
- **Concepts** — Workspaces, boards, columns, groups, items, views, forms, automations, dashboards
- **Operating the App** — Step-by-step usage of every feature
- **Administration** — Roles, backups, updates, troubleshooting
- **Security** — RLS policies, auth, service-role handling
- **Appendix** — Tech stack details

## Tech Stack

- React 19 + TanStack Start v1 + TanStack Query
- Tailwind CSS v4 + shadcn/ui
- Supabase (Postgres + Auth + Storage)
- Vite 7 + Bun + TypeScript
