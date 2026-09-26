# Build log

This is the contemporaneous implementation record. Entries describe observed work, including AI-assisted implementation; they do not claim personal discoveries by the submitter.

## Phase 0 — Starting point (2026-09-26)
- Fetched the public starter through Git and checked out `codex/remoteops`, preserving upstream history. Only candidate files and specifications are being consulted, not reference implementation code.
- Workspace began empty except for `.git`. Submission identity is awaiting user confirmation; no public repository has been created yet.
- Read the candidate module stubs and public UI/API/permission tests. The UI tests require native prompt-based organization creation, exact test attributes, and API response wrappers such as `{devices}`.
- Frontend-first implementation uses a development-only mock adapter; this is not evidence of backend correctness.
- Baseline: JWT suite reports 0 passed / 43 failed; permission suite aborts at the resolver stub. Database reset failed earlier than expected because `URL.pathname` preserved `%20` in our checkout path. Replaced URL pathname extraction with Node's `fileURLToPath` in loader/static serving; schema unchanged.

## Phase 1 — Frontend first (2026-09-27)
- Built the dashboard, login/invite pages, forms, permission-driven controls, and HTTP adapter before implementing backend modules. Mock mode is explicit and production builds eliminate its dynamic import.
- `npm run build` succeeds (33 transformed modules). Browser preview reached the mock dashboard after login. The initial native input interaction did not update React state; filling with browser locators and submitting Enter verified the actual form.
- Original API baseline returns missing-route responses and aborts. Original UI baseline times out waiting for its `/auth/me` readiness URL because no routes exist yet. Neither baseline is reported as passing.
- Loader now works in the space-containing checkout. The seed contains an additional role and permission, confirming that fixed catalogue assumptions would be wrong.
- GitHub CLI is unauthenticated. User confirmed solo identity and was asked to authenticate; publication remains pending.
