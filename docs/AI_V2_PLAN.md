# AI v2 rebuild plan

## Goal
Build a clean, provider-isolated AI pipeline for converting arbitrary procurement documents into a reviewed PR draft without coupling the production UI or routes directly to a specific AI vendor.

## Non-negotiable rules
- No AI code mounted in production UI until backend health checks pass.
- No provider URLs, API keys, or auth headers inside UI components.
- No direct write from AI output into a PR. AI only returns a draft for review.
- No provider-specific parsing logic mixed with document parsing.
- No secrets in GitHub.
- Every provider response is normalized to one internal result type.
- Every PR draft is validated before it can be applied.

## Target architecture
Browser -> existing app -> AI route -> document parser -> AI service -> provider adapter -> provider

Document preprocessing:
- XLS/XLSX: parse workbook locally/server-side into structured text.
- DOCX: extract paragraphs and tables before model invocation.
- PDF/scan/images: preserve visual input for multimodal processing.

AI output:
- Strict JSON only.
- Single internal PR schema.
- Confidence and warnings at header and line-item level.

## Rollout phases

### Phase 0 - Clean baseline
Status: complete on main.
- Old AI UI removed.
- Old AI API routes removed.
- Old Gemini diagnostics removed.
- Old provider experiments removed.
- Existing procurement app remains unchanged.

### Phase 1 - Internal contracts only
Branch: `ai-v2-rebuild`
- Define AI document input contract.
- Define provider-neutral AI service contract.
- Define PR draft schema and validator.
- No HTTP route.
- No UI.
- No provider implementation.

Exit criteria:
- Contracts compile.
- Validator rejects malformed drafts.
- No production behavior changes.

### Phase 2 - Document parser layer
- XLS/XLSX parser.
- DOCX parser.
- PDF/image passthrough metadata.
- Size/type limits centralized.

Exit criteria:
- Test fixtures produce deterministic parser outputs.
- No AI provider required for parser tests.

### Phase 3 - Provider adapter
Preferred production direction: Vertex AI Gemini through a region-controlled Google Cloud setup; AI Gateway may be used for observability/auth but is not required by the internal contract.

- Implement one provider adapter only.
- Add health check inside the provider module, not a public debug endpoint.
- Add timeout, typed errors, retry policy, request ID, and redacted logging.

Exit criteria:
- 20 consecutive text-only health tests succeed.
- Structured JSON generation succeeds consistently.
- No location/auth ambiguity remains.

### Phase 4 - Private API route
- Authenticated route.
- Upload lifecycle and cleanup.
- Parser -> provider -> validator pipeline.
- Sanitized errors only.

Exit criteria:
- Excel, Word, digital PDF, scan PDF, and image fixtures pass.
- No raw provider response leaks to client.

### Phase 5 - Review UI
- Upload.
- Analyze.
- Review/edit draft.
- Apply to existing PR form.
- Low-confidence highlighting.

Exit criteria:
- Existing PR workflow unaffected when AI is unused.
- AI never auto-saves or auto-submits.

## Internal PR draft fields
Header:
- number
- date
- department
- purpose
- overallConfidence
- warnings

Item:
- code
- category
- name
- description
- specification
- unit
- quantity
- estimatedUnitPrice
- confidence
- warnings

## Error model
All AI code must use stable internal error codes:
- AI_NOT_CONFIGURED
- AI_AUTH_FAILED
- AI_PROVIDER_UNAVAILABLE
- AI_TIMEOUT
- AI_RATE_LIMITED
- AI_INVALID_RESPONSE
- DOCUMENT_UNSUPPORTED
- DOCUMENT_TOO_LARGE
- DOCUMENT_PARSE_FAILED
- PR_DRAFT_INVALID

Provider-specific messages are kept server-side only.

## Configuration policy
Production provider configuration must live only in Cloudflare/Google secret stores or bindings. GitHub contains only non-secret defaults and type definitions.

## Branch strategy
All AI v2 work stays on `ai-v2-rebuild` until Phase 4 passes. `main` remains the stable production app without AI.
