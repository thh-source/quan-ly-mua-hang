# AI PR Architecture

## Goal
Convert Excel, Word, PDF and images into a reviewed PR draft without writing AI output directly into production data.

## Production path
Browser -> Cloudflare Worker -> R2 / document parser -> Cloudflare AI Gateway -> Google Vertex AI -> validated PR draft -> review UI -> apply to existing PR form.

## Provider strategy
- Production provider: Google Vertex AI through Cloudflare AI Gateway.
- Authentication: Cloudflare AI Gateway token for the gateway; Google service account stored in AI Gateway BYOK, not in application code.
- Default model: `gemini-3.5-flash`.
- Default location: `global` for PayGo availability. A regional location can be configured later when a model/price combination supports standard PayGo in that region.
- Google AI Studio Developer API is not used for production because the current Cloudflare egress is rejected by Google location checks.

## Required Worker runtime configuration
Secrets:
- `CF_AI_GATEWAY_TOKEN`

Variables:
- `CLOUDFLARE_ACCOUNT_ID`
- `CF_AI_GATEWAY_ID` (normally `gemini-gateway`)
- `GCP_PROJECT_ID`
- `VERTEX_AI_LOCATION` (default `global`)
- `VERTEX_AI_MODEL` (default `gemini-3.5-flash`)

`wrangler.jsonc` uses `keep_vars: true` so dashboard variables survive Git-based deployments.

## Required Cloudflare AI Gateway configuration
1. Gateway: `gemini-gateway`.
2. Authentication token with `AI Gateway: Run`.
3. Provider Keys -> Google Vertex AI -> store a Google service-account JSON using BYOK.
4. The service account needs Vertex AI inference permission; `Vertex AI User` is sufficient for the intended inference calls.

## Required Google Cloud configuration
1. Create/select a Google Cloud project.
2. Enable Vertex AI API.
3. Create a service account dedicated to this application.
4. Grant `Vertex AI User` to the service account.
5. Create a service-account JSON key only for Cloudflare AI Gateway BYOK storage.
6. Store the JSON in Cloudflare AI Gateway Provider Keys, then keep it out of GitHub and Worker environment variables.

## Document pipeline
- XLS/XLSX: parse workbook locally and send normalized text/CSV to Vertex.
- DOCX: extract paragraphs and tables before AI analysis.
- PDF/image: send binary document/vision input to Vertex where supported.
- Large files: upload in chunks to R2; server reads from R2 and analyzes after the upload is complete.

## Output contract
AI returns structured JSON only. The server normalizes and validates the result before returning it to the browser. AI never saves a PR automatically.

Fields:
- PR: number, date, department, purpose, overallConfidence, warnings.
- Item: code, category, name, desc, spec, unit, qty, estimate, confidence, warning.

## Rollout gates
### Phase 1 - Infrastructure
Vertex health check must pass repeatedly through AI Gateway before production cutover.

### Phase 2 - AI service abstraction
All provider-specific URLs/auth live under `app/lib/ai`. PR routes call the abstraction only.

### Phase 3 - Document parsing
Add deterministic Excel and DOCX parsing; use multimodal processing only where it adds value.

### Phase 4 - PR route cutover
Replace the legacy Gemini Developer API route with `pr-analyzer` after Vertex health passes.

### Phase 5 - Test and hardening
Test real files, validate confidence/warnings, add sanitized request IDs/logging, then remove temporary diagnostics.
