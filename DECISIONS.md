# Implementation decisions

## Frontend first, with an interchangeable API boundary
- **Choice:** Build React views against a development-only adapter using the same request/response shapes as the HTTP API.
- **Why:** The user requested frontend first; authentication and all route modules currently ship as stubs.
- **Rejected:** Computing role permissions in React. This duplicates authority and fails the supplied UI interception test.
- **Reconsider if:** Contract-driven mocks become harder to maintain than connecting a completed endpoint.

## Sources and assistance
- Rhinostream candidate starter, candidate specifications, schema and public tests: supplied baseline and interface contracts. No reference implementation or other submission code is used.
- OpenAI Codex: planning, code generation, debugging, and test execution. The submitter must review and understand the resulting code; this log records agent work explicitly.
- Existing npm dependencies: React and React DOM (UI), Vite and its React plugin (build), better-sqlite3 (database), Playwright (browser tests). Retain their supplied licenses and package lock.

## Where this repo argues with itself
- The root repository README describes `q1-starter` as reference implementation; work is restricted to `starter`.
- The UI inventory says seven cards but lists six; implement the six enumerated cards.
- The email says roughly one-third documentation; the candidate rubric specifies 30% documentation, 50% code, 20% walkthrough.

## Request-local authority, no cross-request cache
- **Choice:** Batch catalogue/grant queries within a request, then resolve device rows from that snapshot.
- **Why:** Time-window expiry must take effect on the next request even without a mutation/version bump.
- **Rejected:** A simple TTL permission cache can authorize a just-expired grant.
- **Reconsider if:** Measured query costs justify a cache with exact expiry/version invalidation.

## Preserve platform paths correctly
- **Choice:** Use `fileURLToPath` for loader/static paths.
- **Why:** Baseline db:reset failed with ENOENT on `Rhinostream%20applocation`.
- **Rejected:** Renaming the user's directory would hide a portability bug and fail other checkouts containing spaces.
- **Reconsider if:** File APIs receive URL objects directly everywhere.
