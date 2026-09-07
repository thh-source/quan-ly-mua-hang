# SCMH Rebuild — Phase 2 Snapshot

This directory contains the clean SCMH rebuild snapshot for Phase 2.

## Scope
- Product Catalog
- Supplier Catalog
- Purchase History
- Supplier/Product normalization and matching

## Stack
- React + Vite + TypeScript
- Hono on Cloudflare Workers
- Cloudflare D1 + Drizzle ORM
- Cloudflare R2 binding reserved for document/file phases
- pnpm workspace

## Safety
This rebuild is isolated under `scmh/` so the legacy application can remain untouched while the new system is validated.

## Local setup
```bash
cd scmh
pnpm install
pnpm --filter @scmh/api db:migrate:local
pnpm dev
```

Configure Cloudflare IDs in `apps/api/wrangler.toml` before deployment. Do not commit secrets.
