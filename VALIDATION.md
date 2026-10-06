# Swarm Chat validation record

Date: October 6, 2026. This is the worker's local evidence, not independent network certification.

## Scope, plan and assumptions

Implemented the requested single-page static reader, with Vite/React/TypeScript, relative URLs and a checked-in-ready `dist/` export. The bounded plan was: inspect API CORS and the pinned six-domain guide; build the source and local assets; validate the export and interactions; fix observed findings; document and check packaging.

All agent bodies are verbatim API `summary`/`answer` values. Only interface labels and requested system events are authored by the application. The 1,000-item cap includes system events as well as agent messages, a stricter bound than the requested maximum. Jobs can interleave chronologically, so their divider repeats on returning to a different job/channel. Sidebar aggregates cover retained events, independent of the active filters. Source research times are absent; estimated times are visibly marked.

The application uses live browser requests exclusively. To inspect populated states despite the external CORS failure, the browser validator intercepts requests with previously captured public API responses. Those captures contain real agent text, live only under disposable `test/scratch/`, and never enter `dist/`. Metadata changes and withholding/releasing one real submission simulate updates; message bodies are not invented.

## Commands and actual results

| Check | Actual result |
| --- | --- |
| Production build: external Vite 7.2.2 binary with `SWARM_DEPENDENCIES=/tmp/swarm-build` | Exit 0 after final source changes; 32 modules transformed; JS 218.80 kB (69.00 kB gzip), CSS 23.75 kB (5.59 kB gzip). Seven local font faces and eight WebP memes present. |
| Typecheck: `node /tmp/swarm-build/node_modules/typescript/bin/tsc --noEmit -p /tmp/swarm-typecheck.json` | Exit 0. The temporary config extends the delivered config and redirects only type/module lookup to external dependencies. |
| Browser validation: `node scripts/validate.mjs` with the dependency/browser environment shown in README | Exit 0, 14 grouped checks passed. The final first captured-source message appeared in **1,377 ms**. This is an intercepted-response measurement, not live/published acceptance. |
| Isolated formatter check: `node test/scratch/format-check.cjs` | Exit 0: React escapes an adversarial HTML input; bold/code/list rendering succeeds; HTTPS links work; unsafe links stay text. This synthetic parser input is never rendered in the site's conversation. |
| Package check: `node scripts/check-package.mjs` | Exit 0; the complete deliverable including supplementary artifacts is under 2 MiB; the runtime export is 624,749 bytes. Source, lockfile, export and all required runtime assets retained; no dependency trees, archives or submodules. |

Initial test-harness failures were repaired before these successful runs: the managed browser revision required an explicit executable path, the constrained container needed a single-process headless shell, axe required an explicit browser context, and keyboard setup needed a deterministic initial focus. These are test setup changes, not evidence of a passing earlier run. An initial TypeScript environment declaration error was also repaired before the final check.

The validator's clock advances verify scheduled refreshes without waiting a real minute for every case. The actual live browser separately remained open across normal minute-based retries; browser console timestamps showed recurring jobs/research requests at approximately 60-second intervals.

## Functional checks

The final successful browser suite checked:

- Source-text equality, duplicate removal, channel classification, invalid/no-answer filtering, HTTPS-only links, estimated research time bounds, and the 1,000-event cap.
- Populated rendering within 10 seconds using captured responses; staggered request starts; no submission requests for exact `research` templates.
- A 60-second refresh without refetching unchanged jobs; changing one `updatedAt` fetches only that job again, without navigation/reload.
- Each of builds/audits/research/oracle; exact agent-number filtering; filter-empty recovery; clear filters.
- Show more/less state and accessible expansion, judge-detail disclosure, explorer/PR/source URLs, and long/short pick chips.
- Keyboard skip link to the main landmark, keyboard channel activation, and a 2px focus perimeter. The focused state was also viewed in a screenshot.
- Persistent light/dark theme, healthy empty state, manual retry recovery, retained messages after a failed refresh, and reduced-motion suppression of mascot rotation.
- No horizontal document overflow at 1440×1000, 1024×900, 820×1000, 400×860 and 320×800. Root text size doubled to 32px at 400px also passed the horizontal-overflow check. This is **not** browser-native zoom.
- Local font availability using `document.fonts.check` for the three required families; no application exceptions or failed local resources under `/preview/`.

## Better Interface coverage

The supplied workflow and core principles for all six domains were read before implementation; the supplied documentation method was read before writing DESIGN.md.

| Domain | Coverage | Evidence and limits |
| --- | --- | --- |
| Accessibility | **Checked** | Native buttons/links/details; named filter and icon controls; selected/expanded states; skip link; keyboard activation; visible focus screenshot; polite status regions; reduced-motion handling; decorative alt text. Axe WCAG A/AA/2.1 AA scans reported zero violations for desktop light and dark populated states and the light research/picks state. Actual screen-reader sessions, physical touch devices, exhaustive keyboard traversal and forced-colors rendering are **not verified**. |
| Layout | **Checked** | Desktop/phone screenshots, 320px reflow and intermediate 820px screenshot; bounds at five widths; text enlargement; normal-flow sidebar disclosure; independent chat scroll; limited decorative images. Very wide screens above the 1500px breakpoint, browser-native 200% zoom, RTL mirroring and pseudo-localization are **not verified**. |
| Writing | **Checked** | Labels match actions; agent/source text remains verbatim; estimate marking; explicit unavailable counts; recovery copy for connection/filter/healthy-empty states. The CORS explanation distinguishes the observed launch condition from possible network errors. No editorial changes to agent content. |
| Typography | **Checked** | Requested local families; real face weights; loaded-font checks; 75ch reading measure; long text and URLs; 16px mobile input; tabular times; responsive preview lengths. Native-device rasterization and non-Latin fallback fonts are **not verified**. |
| Colors | **Checked** | Both semantic theme blocks, actual browser-computed foreground/background pairs, WCAG luminance calculations and axe; corrected the accepted-status contrast finding. All possible avatar/filter/hover combinations were not exhaustively measured; transparency over artwork is decorative, not a text background. |
| UI | **Checked** | Loading, reconnecting, healthy empty, filter empty, populated, selected, expanded, focus, disabled retry and both themes exercised. Local still-image mascot, pause affordance, reduced-motion behavior, restrained press feedback and flat surfaces reviewed. Frame-by-frame animation replay and physical-device hit testing are **not verified**. |

Not applicable: authentication, wallets, transactions, forms with submission, modal focus trapping, routes requiring server rewrites, uploads and destructive actions.

## Findings, fixes and rechecks

| Severity | Source location | Evidence, resolution and recheck |
| --- | --- | --- |
| **HIGH · external blocker** | `src/api.ts:54`, `src/App.tsx:644` | Cross-origin jobs, submissions and panels omit an allow-origin header. Actual Chromium console reports CORS blocks; the live page contains zero chat messages. `/swarm` succeeds. Added explicit explanation, retry, Explorer link, unavailable metrics and independent swarm loading. Rechecked live in Chromium. The upstream header fix remains outside the static export; live-message acceptance is not met. |
| **HIGH · fixed** | `src/style.css:69`, `src/style.css:778` | Axe found insufficient small-text contrast: `#1D7F4F` on `#E9F5ED` measured **4.46:1**, and on `#EDF0F4` **4.37:1**, below 4.5:1. Verdict pills now retain the required green as a fill with white text (**5.00:1**). Secondary positive text uses `#17673F`, measuring **6.15:1** on the pale positive background and **6.03:1** on the page. Final light/dark and research scans passed. |
| **MEDIUM · fixed** | `src/RichText.tsx:81`, `src/App.tsx:270` | The first 400px screenshot placed the last long message's identity above the viewport at the bottom of the stream. Phone previews now use 240 characters/six source lines, with full text behind Show more. Final 400px light/dark screenshots visibly include the agent avatar, number and metadata. |
| **MEDIUM · fixed** | `src/style.css:1` | Initial font declarations mapped static faces across multiple weights. Real 500-weight Sans/Mono files were added and faces now declare their actual weights; Bricolage's variable range is 200–800. Final browser checks find all three families loaded. |
| **MEDIUM · fixed** | `src/style.css:55`, typography declarations and mobile panel minimum | Initial fixed pixel text sizes did not consistently follow root text enlargement. Converted text sizes to rem/em and panel minimum heights to rem. At a 32px root and 400px viewport, no horizontal document overflow was measured. Native browser zoom remains unverified. |
| **LOW · fixed** | `src/assets/fonts/`, `src/style.css:1` | Font files imported from public were duplicated in the export. Moved source fonts into `src/assets/fonts/`; the final export has one hashed copy per face, with notices retained separately. Package check passed. |

## Measured contrast

Computed colors were captured from the rendered production page. Ratios use the WCAG sRGB relative-luminance formula. Small text is evaluated at 4.5:1; the selected-button pair also provides more than the required 3:1 focus boundary against that background.

| Rendered pair | Light ratio | Dark ratio |
| --- | ---: | ---: |
| Message body / chat panel | 16.40:1 | 14.04:1 |
| Model metadata / chat panel | 5.56:1 | 7.60:1 |
| HTTPS link / chat panel | 6.23:1 | 7.10:1 |
| Accepted label / green pill | 5.00:1 | 5.00:1 |
| Selected channel text / selection background | 5.27:1 | 5.11:1 |

Exact RGB pairs and computed ratios are in `docs/check-results.json` (also preserved in the supplementary artifacts). The page's explicitly coded values and theme behavior are documented in root DESIGN.md.

## Visual evidence

All listed images are genuine screenshots that were opened and inspected, rather than placeholder artifacts:

- `live-desktop.jpg`: actual network/CORS failure, 1440×1000; real working agents remain available.
- `live-320.jpg`, `live-820.jpg`: actual final export at narrow/intermediate widths. At 320px, the channel strip scrolls with part of the next channel visible; the chat stream can scroll to the connection actions.
- `chat-desktop.jpg`, `chat-dark.jpg`: captured real API responses, 1440×1000.
- `chat-mobile.jpg`, `chat-mobile-dark.jpg`: final compact previews, 400×860; agent identity remains visible.
- `keyboard-focus.jpg`: keyboard-focused channel, captured-response view, 1440×1000.

The browser screenshots use simulated clock advances during update tests, so their displayed “updated” times need not match wall-clock capture times. They are not evidence of a published live service.

## Packaging and completion

Eight visually inspected stills from the IMD Meme Vault are local 512px WebP images; combined size is 204,118 bytes. Their individual source names/URLs and vault credit are delivered. Source, lockfile, font notices and required export files remain complete. No ignore file was edited; no `.git/`, `.github/`, `.env` or repository `node_modules/` path was modified. Dependencies and package-manager caches were installed in `/tmp/`. Temporary test fixtures are excluded by the assignment's disposable scratch mechanism.

The repository excludes `artifacts/` through its existing metadata. This report is also preserved as root `VALIDATION.md`, with results and guidance license notices in `docs/`, so source documentation survives normal Git collection. Screenshots remain supplementary artifacts. No ignore file or Git metadata was changed.

**Incomplete for end-to-end live acceptance because of the external API CORS block.** The useful static deliverable, local production build, typecheck, interaction validation, six-domain review, repairs and documentation are complete. Published-host behavior and real live-message arrival within ten seconds cannot be certified here. Enabling the chat endpoints' CORS response headers is the remaining dependency; the existing client will retry them automatically.
