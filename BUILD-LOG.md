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

## Phase 2 — Backend implementation (2026-09-27)
- Implemented token verification and caller context, then one database-driven permission engine. First run: JWT 43/43, permissions 35/35.
- Implemented all published route groups plus catalogue and logout. First API run after wiring: 66 passed, 0 failed. Personalized fixture: 18 passed, 0 failed.
- Observed two schema details requiring explicit transactional handling: invitation uniqueness does not account for time expiry; refresh replay revocation would roll back if an exception escaped its transaction. Expired invitations are retired on replacement, and replay rejection is returned from the transaction then thrown after commit.
- Full browser suite is now testing the real HTTP adapter. Mock preview success was not counted toward these checks.
