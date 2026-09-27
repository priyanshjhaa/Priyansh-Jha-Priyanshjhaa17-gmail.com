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

## Transactions must preserve the intended failure side effect
- **Choice:** Refresh replay commits family revocation before throwing the HTTP error. Successful mutations and audit rows commit together; denial audit rows are written after rollback.
- **Why:** Throwing inside the transaction would discard the very revocation or denial evidence required on failure.
- **Rejected:** One generic transaction wrapper for every endpoint, including refresh.
- **Reconsider if:** An explicit transaction result type replaces exception-based HTTP flow throughout.

## Existing-account invitations require its password
- **Choice:** Existing users prove their existing password when redeeming an invitation. Never replace their global credentials or duplicate the account.
- **Why:** A bearer invite to one organization must not let someone replace credentials or gain other memberships.
- **Rejected:** Blind upsert of name/password on invite acceptance.
- **Reconsider if:** Acceptance requires an already authenticated identity instead.

## Offboarding closes old overrides
- **Choice:** Removing membership revokes its grants, increments its version, and ends sessions. Reinstating suspension preserves grants; re-inviting a removed member does not revive them.
- **Why:** Rehire is a new authorization decision, not restoration of historical exceptional access.
- **Rejected:** Retaining unrevoked grants across removal and re-invitation.
- **Reconsider if:** An explicit product requirement authorizes restoration with a review step.

## Invitation uniqueness and single use are different guarantees
- **Choice:** Acceptance uses an immediate transaction plus a conditional accepted_at update. Expired outstanding invites are retired before replacement.
- **Why:** The partial index filters accepted_at/revoked_at, not expires_at; its existence alone does not prevent accepting the same row twice.
- **Rejected:** Trusting prose about the index without inspecting its predicate.
- **Reconsider if:** The immutable schema contract changes to encode these transitions.

## Authorization is checked inside the mutation transaction
- **Choice:** Reauthenticate after acquiring the write transaction and clear request-local permission inputs.
- **Why:** Reading HTTP bodies yields; another request may revoke authority before the first request is ready to mutate.
- **Rejected:** Treating an earlier middleware check as authority for the entire request regardless of interleaving.
- **Reconsider if:** A request pipeline obtains and holds an equivalent consistent authorization snapshot through mutation.

## Local typography and readable source
- **Choice:** Bundle DM Sans and Manrope through Fontsource; format implementation with Prettier.
- **Why:** External font requests can delay the initial render, and readable source supports the required walkthrough.
- **Rejected:** Runtime Google Fonts CSS and compressed source.
- **Reconsider if:** Asset measurements warrant system fonts alone.
- **Sources:** https://fontsource.org/fonts/dm-sans and https://fontsource.org/fonts/manrope (font files); https://prettier.io/ (development formatting).

## Monochrome workspace identity
- **Choice:** Use only black, graphite, and silver throughout, with per-organization identity expressed as small changes in black surface depth and silver intensity.
- **Why:** The requested direction is an all-black interface with shiny silver type and effects that reinforce a secure operations console. The supplied tests also require switching organizations to create a measurable visual change.
- **Rejected:** Keeping colored organization accents, which conflicts with the monochrome direction; making every organization pixel-identical, which removes a required identity signal.
- **Reconsider if:** Product branding later supplies organization-specific monochrome marks or textures that can replace the computed surface variation.

## Ambient motion stays decorative and accessibility-aware
- **Choice:** Build the background motion with low-contrast CSS pseudo-elements, long animation cycles, no pointer handling, and a `prefers-reduced-motion` override.
- **Why:** Radar rotation, signal sweeps, and grid drift reinforce the live operations context without changing application state or competing with tables and controls.
- **Rejected:** Canvas particles and looping video. Both add runtime and asset weight, and their continuous high-detail movement would distract from operational data.
- **Reconsider if:** A future brand motion specification calls for authored assets and includes performance and accessibility targets.

## Separate interface type from telemetry type
- **Choice:** Use Space Grotesk for general interface text and JetBrains Mono only for compact operational metadata, with both fonts bundled locally through Fontsource.
- **Why:** Space Grotesk gives the monochrome console a more technical shape while remaining readable in forms and tables. Monospaced metadata makes statuses, identifiers, timestamps, and numeric values easier to scan without making long-form UI copy feel dense.
- **Rejected:** A monospaced font across the whole application, which reduces readability; keeping DM Sans and Manrope, whose softer editorial character did not reinforce the remote-operations purpose as clearly.
- **Reconsider if:** User testing shows the geometric letterforms or compact telemetry labels reduce readability at small sizes.
- **Sources:** https://fontsource.org/fonts/space-grotesk and https://fontsource.org/fonts/jetbrains-mono (font files and package metadata).

## Preserve tab organization context in the URL
- **Choice:** Keep the selected organization id in the tab URL and pass it to refresh during restoration.
- **Why:** Access tokens remain memory-only, while each tab can reload into its own organization context. An organization id is routing context rather than a credential, and the URL makes that context independently inspectable per tab.
- **Rejected:** `localStorage`, which is shared across tabs and would create cross-tab organization bleed; relying on the first membership after every reload, which silently changes context.
- **Reconsider if:** The application gains a real client router with organization-scoped paths, at which point the path should carry the same context instead of a query parameter.

## Keep one reviewer-facing documentation set at the root
- **Choice:** Retain the supplied specifications and discovery brief, but remove the untouched duplicate README, build-log template, and decisions template from `starter/` after completing their root replacements.
- **Why:** The submission instructions explicitly require `BUILD-LOG.md` and `DECISIONS.md` at the repository root. The duplicate templates still described authentication as a stub and contained placeholder sections, which could mislead a reviewer about the completed state.
- **Rejected:** Removing all supplied documentation, which would discard useful grading context; keeping every duplicate, which leaves two conflicting descriptions of the same project.
- **Reconsider if:** The grader requires exact starter-tree preservation beyond the database schema and reference data; Git history still provides the original files without cluttering the submitted tree.
