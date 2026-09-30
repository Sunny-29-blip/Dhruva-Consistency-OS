# Dhruva

Dhruva is an AI-powered consistency operating system for goals, habits, daily tasks, and data-grounded coaching.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/dhruva` — React/Vite web app and responsive product UI.
- `artifacts/api-server` — Express API, session auth, deterministic stats, and coaching fallback routes.
- `lib/api-spec/openapi.yaml` — API contract source of truth.
- `lib/db/src/schema/dhruva.ts` — relational PostgreSQL schema.

## Architecture decisions

- OpenAPI is generated before frontend work so the React app consumes typed hooks from the shared client.
- Server sessions use PostgreSQL via `connect-pg-simple`; password auth is bcryptjs with cost 12.
- Coaching returns an explicit deterministic fallback when an AI provider is unavailable rather than pretending model output exists.

## Product

Dhruva includes marketing, auth, onboarding, Today, task views, habit and goal management, consistency charts, coach/recommendation surfaces, reviews, and settings. The demo account is `demo@dhruva.app` with password `DemoPass123!`.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Use `pnpm --filter @workspace/api-spec run codegen` after OpenAPI changes.
- Use `pnpm --filter @workspace/db run push` after schema changes.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
