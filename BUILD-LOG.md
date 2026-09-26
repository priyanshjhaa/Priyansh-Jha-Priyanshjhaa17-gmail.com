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
- Browser testing found an incorrect visual assumption: unknown themes fell back to cobalt, so Acme/cobalt and Globex/amber rendered the same background. Replaced the fallback with deterministic theme-derived colors, retaining a distinct accent/background for arbitrary theme strings.
- Browser failures exposed a second frontend bug: a fixed-height flex sidebar shrank the organization list until the create button intercepted its clicks. Preserved child heights and made the sidebar scroll, rather than forcing clicks in tests. Also corrected error propagation for direct actions and refresh of navigation permissions on each screen fetch.
- Corrected frontend run: all 25 supplied browser tests pass (15.2 seconds). Additional API hardening: 42 assertions pass.
- Review found a concurrency gap beyond public tests: authentication ran before the asynchronous request-body read. A queued mutation could retain pre-revocation context. Mutations now authenticate again after obtaining their write transaction.
- Removed external font loading in favor of locally bundled Fontsource fonts; repeated navigation now deliberately refreshes instead of leaving a loading state without an effect trigger.
- Full extended UI run: 30/30 passed in 10.1 seconds (the original 25 plus five independent workflow checks). Added a final desktop screenshot/performance record test.
- Batched resolver measurement over 20 runs: 5 queries at 10/100/500 devices; means 0.13/0.30/1.21 ms on this machine. This measures resolution, not a promise of constant total response time.
- Delayed-body revocation test passes; hardening now totals 44 assertions.
- Excluded inherited reference implementation and organizer-only files from the current branch tree without reading their code or rewriting upstream history. Replaced the organizer README with candidate startup/verification documentation.

## Phase 3 — Final verification (2026-09-27)
- After usage reset, resumed the previously blocked approval requests and reran the latest code. JWT 43/43; permissions 35/35; API 66/66; browser 31/31 (10.3 s); hardening 44 assertions. Both supplied and independent personalization nonces pass 18 assertions.
- Browser measurement: login screen 50 ms; sign-in to first device 123 ms. Saved the actual test screenshot to artifacts/dashboard.png.
- Formatting and whitespace checks pass. Database schema/reference files are unchanged from upstream.
- GitHub authentication check still reports no signed-in hosts; publishing is pending. No submission form has been sent.
- Fresh clone of implementation commit 4b508e5: exact documented npm install/reset/dev command succeeds. Homepage, login, and authenticated device listing return 200; list has the expected five records. No previously installed dependencies or workspace database were reused.

## Phase 4 — Monochrome interface direction (2026-09-27)
- Reworked the complete interface into an all-black control-console palette after the requested visual-direction change. The new system uses near-black layered surfaces, metallic silver typography, local glow and scanning textures, and reduced-motion-aware status animation.
- Preserved a measurable organization identity using slightly different black surface levels and silver intensity rather than colored themes. This keeps the UI monochrome while retaining the required organization-switch behavior.
- Rebuilt successfully, formatting checks passed, and all 31 browser tests passed in 11.0 seconds. The test-generated dashboard screenshot was refreshed with the new appearance.

## Phase 5 — Ambient console motion (2026-09-27)
- Added slow, CSS-only background motion that supports the remote-operations setting: a rotating telemetry field, diagonal signal sweep, drifting grid, and login orbit. Every layer ignores pointer input and remains behind the application surfaces.
- Added a complete reduced-motion override that stops the new ambient effects along with the existing status and logo animations when the operating system requests less motion.
- Production build and formatting checks pass. All 31 browser tests pass in 22.5 seconds; the test-generated dashboard screenshot was refreshed with the animated theme in its resting state.
