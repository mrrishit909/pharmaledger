# PharmaLedger landing page: design decision

Scope: root `index.html`, `app/landing.css`, `app/landing/mark.svg`. The workbench (`app/index.html`, `app/app.js`, `app/ui.js`, `app/styles.css`), engine, fixtures and build script are unchanged. All data is synthetic; `pharma-reconcile-1` is fictional.

Inputs read: Atlas `docs/design/VISUAL-DIRECTIONS.md`, `docs/specs/PHARMALEDGER-VERTICAL-SLICE.md`, `AGENTS.md`, `DESIGN-STANDARDS.md`; this repo's README, `app/index.html`, `fixtures/index.js`, `src/rules.js`, `src/engine.js`, `scripts/build.mjs`; the installed website-playbook and its `references/quality-rubric.md` and `references/motion-and-assets.md`.

## Three directions

| | A. Continuous-form register (chosen) | B. Relational join schematic | C. Label print stack |
|---|---|---|---|
| Idea | Tractor-feed register paper: sprocket margins, green-bar banding, one row pulled out and followed across perforated stages | Entity boxes for transaction, site and evidence with drawn key joins, blueprint-like | Stacked thermal print labels and slips, one per record |
| Type | Condensed grotesque display, humanist sans body, mono for every field | Geometric sans, mono keys | Mono throughout |
| Palette | Ivory, green-bar teal, aubergine ink | Blueprint navy, white lines | White stock, black thermal print |
| Motion / mobile | Line-feed print, joins draw; numbered stacked stages | Joins draw edge by edge; graph collapses to a list | Labels peel off a stack; one label per screen |
| Rejected because | | Reads as developer tooling (an ER diagram), cold for a reconciliation story | Thermal slips and labels read as pharmacy counter and dispensing, close to healthcare and medication imagery |

Why A: the product is a register. Each row is followed to the site and evidence it names, and findings print beside it. Continuous-form paper makes that row-by-row reading physical. It also separates PharmaLedger from the Atlas siblings, which all use Iowan serif headings on paper folios (HospiceAudit's plum is close to this product's aubergine). PharmaLedger uses no serif, makes teal and green-bar paper the dominant signal, and keeps aubergine as ink.

## Tokens

| Token | Value | Role |
|---|---|---|
| `--ivory` | `#f8f5ed` | Page ground, punched holes |
| `--paper` | `#fdfcf7` | Form sheet, stages, register |
| `--bar` | `#dce9e4` | Green-bar bands, join highlight, button offset |
| `--teal` | `#286c69` | Joins, site window band, section numbers |
| `--teal-deep` | `#17403e` | CTA, joined values, close band |
| `--aub` | `#3c3049` | Body ink, rules, T3 marker, finding remarks |
| `--stone` | `#625b54` | Secondary labels (darkened from the brief's #6E6760 so it holds about 5.4:1 on `--bar`, a hand estimate) |
| `--rule` | `#d6cfc0` | Hairlines, perforations |

- Type: display `"Avenir Next Condensed", "Helvetica Neue", "Arial Narrow"`; body `"Avenir Next", "Segoe UI", "Helvetica Neue"`; mono `ui-monospace, "SF Mono", Menlo`. System stacks only, because the CSP has no `font-src` (Manrope and Source Sans from VISUAL-DIRECTIONS cannot load). h1 `clamp(2.6rem, 7.2vw, 5.6rem)`, line height 0.96; h2 `clamp(2rem, 4.4vw, 3.4rem)`; body 1.0625rem/1.6.
- Contrast: estimated, not measured. Findings use aubergine with a rule, never red, and nothing is drawn as a verdict stamp.

## Layout

Notice band, then the hero: claim on the left, the `golden` fixture printed as a tilted continuous form on the right, with T3 pulled out. Section 01 follows T3 through three stages divided by perforations: the transaction slip, the H2 site window (year axis plus a loupe on 30 May to 2 June showing the one-day gap), and the E2 supplied label (`"no"`). Each stage carries the engine's finding text verbatim. Then come the six-row register with raw and accepted totals kept apart, the eight fictional rules with their `golden` counts, workbench steps, limits, and the CTA. Every CTA uses the relative `app/`, so under GitHub Pages it resolves to `/pharmaledger/app/`.

## Motion

CSS only, all inside `prefers-reduced-motion: no-preference`:
- The hero form feeds line by line (stepped clip), then T3 slides out of the sheet.
- In Section 01, where `animation-timeline: view()` is supported, the stages rise in, the join tabs print, the window bands open from validFrom and the one-day gap draws. The T3 dot pulses twice.
- Hover: button offset shadows and register row marks.

With reduced motion, or in a browser without `view()`, everything is static and fully visible.

## Mobile (< 48rem)

- Stages stack in number order, joined by dashed vertical connectors with `siteId H2` and `evidenceId E2` tabs.
- The year axis shows quarter initials only; the loupe keeps a readable scale.
- Register rows become labelled slips (no sideways table scroll).
- Navigation wraps to a full-width row under the brand.
- The hero form drops its tilt and tightens to 0.66rem. It is decorative (`aria-hidden`), and the full register below carries the same data.

## Known risks and stale docs

- The page is hand-transcribed from `fixtures/index.js` `golden` and `src/rules.js`/`src/engine.js`. Nothing checks it against the fixture, so it goes stale silently if they change.
- The README and the `/` comment in `scripts/serve.mjs` still describe `/` as the workbench. They were not edited because they are out of scope. Under `npm run serve`, the root may still serve the workbench rather than this page; only `dist/` is guaranteed.
- There is a palette seam with the workbench's own styles, which were not changed.

## Browser evidence and rubric status

`npm run build` passed after implementation. Inspected Chrome renders at 1440×900 and 390×844, including separate desktop views of the T3 exhibit, full register and rules. The 390px document and body widths both measure 390px. The hero's continuous-feed lines clipped at desktop and mobile sizes; font size and row spacing were reduced, rebuilt, and the phone viewport checked again. Links resolve relatively to `/pharmaledger/app/` in the preview. No tests were run.

| Criterion | Status | Evidence and remaining check |
|---|---|---|
| Point of view | Strong | Continuous-form register and transaction-to-evidence progression are visible in the inspected renders; user review remains primary. |
| Typography | Mixed | Distinct condensed display, sans body, mono fields rendered clearly; manually inspect smallest form text at additional phone sizes. |
| Colour | Mixed | Paper, aubergine and teal render coherently; contrast has not been instrumentally measured. |
| Hierarchy | Strong | Hero, T3 chain, full register and rule ledger inspected at desktop; compact phone hero inspected. |
| Imagery | Strong | Original vector/site-window diagram and register artifact inspected; exhibit diagram should receive a full phone-size inspection. |
| Motion | Unverified | CSS includes reduced-motion fallback; animation states and reduced-motion mode have not been checked in motion. |
| Mobile | Mixed | 390px no-overflow measurement and first-screen layout inspected; full-page phone journey and keyboard focus remain unchecked. |
| Invisible quality | Mixed | Production build passed and relative CTA verified; keyboard journey, CSP in hosted context, measured contrast, axe, Safari/Firefox and live Pages remain unchecked. |

Content facts were cross-checked against the fixture, engine source and Atlas spec. The hand-transcribed homepage data still needs a drift check if the golden fixture changes.
