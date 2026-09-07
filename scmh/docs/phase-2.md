# Phase 2 — Product / Supplier / Purchase History / Normalization

## Implemented in this snapshot
- Relational D1 schema with soft-delete-ready Product and Supplier entities
- Alias tables for canonical normalization
- Purchase history with deterministic VND integer values and quantity in micros
- Duplicate fingerprint column for historical import safety
- Hono REST endpoints under /api/v1
- Search and status filtering
- Create/update/soft-delete for Product and Supplier
- Purchase-history insert/list/product statistics
- Normalization/matching endpoint with persisted match records
- React enterprise shell with Product, Supplier, Purchase History and Normalization views
- Loading, empty and error states
- Cloudflare D1 and R2 bindings declared without secrets

## Deliberately not faked
The Phase 2 acceptance criteria also require Excel import/export. The production UI actions are intentionally not shown until the parser, validation preview and transaction import/export are implemented end-to-end. This avoids fake buttons.

## Next implementation slice
1. XLSX template + parser for Product/Supplier/Purchase History
2. Preview/validation error model
3. Duplicate detection using source_fingerprint
4. Confirm import transaction
5. Export XLSX with Vietnamese formatting
6. Authentication/authorization integration from Phase 1 foundation
7. Unit/integration tests and Playwright acceptance flow

## Cloudflare migration strategy
Keep the existing production D1/R2/Workers/Pages untouched until this branch is validated. Bind `SCMH_DB` / `FILES` to staging resources first. After acceptance, map to approved production resources via Cloudflare configuration, not source-code secrets.
