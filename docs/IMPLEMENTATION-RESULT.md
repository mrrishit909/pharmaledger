# Implementation result: PharmaLedger synthetic slice (resume session 2026-11-04)

Synthetic demo data only. Fictional rule pack `pharma-reconcile-1`. No legal, regulatory,
clinical or 340B authority. The counts below are from the project's own Node test suite, not
an independent audit; source remains unverified until the root review checks it.

## Test command and final run

```
node --test "tests/**/*.test.js"
```

Final run (2026-11-04, ~02:42 UTC) summary lines:

```
ℹ tests 53
ℹ suites 0
ℹ pass 53
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

Session start: 49 pass / 4 fail (same command). `npm test` previously ran `node --test tests/`,
which fails on Node 24.

## Files changed in this session

- `package.json`: `"test"` script changed to `node --test "tests/**/*.test.js"`.
- `src/report.js`: `NEEDS_QUOTES_RE` now includes `\t`, so a cell containing a tab is quoted
  after formula neutralisation (`csvCell('\tx')` -> `"'\tx"`). Stricter, not weaker.
- `src/engine.js`: per-row `findingIds` are sorted by `ruleId` so they match the order of the
  report-level `findings` array (deterministic, consistent ordering).
- `tests/adversarial.test.js`: two test corrections, listed below.

## Files added in this session

- `scripts/serve.mjs`: loopback-only (127.0.0.1) static server for `app/`, `src/`,
  `fixtures/`; CSP and nosniff headers; GET/HEAD only; path traversal and other directories
  return 404; no network fetches; stops on SIGINT/SIGTERM.
- `app/index.html`, `app/styles.css`, `app/app.js`: workbench wired to the real engine.
- `README.md`, `docs/IMPLEMENTATION-RESULT.md`.

## Fixes made (engine-level failures at session start)

1. "case 1: identical duplicate eventKey records yield exactly one flag per later row
   regardless of ordering" -> test correction (see below); engine behaviour unchanged.
2. "case 5: no/unknown eligibility stay illustrative ..." (`TypeError ... reading 'findings'`)
   -> test correction (see below); engine behaviour unchanged.
3. "case 7: HTML/script payloads stay inert strings; formula-leading CSV cells neutralised"
   -> engine fix in `src/report.js` (tab-containing cells quoted).
4. "row statuses: T1 reversed ..., findings retained for reversed dispenses" -> engine fix in
   `src/engine.js` (`row.findingIds` sorted by ruleId: `['T2:MISSING_EVIDENCE',
   'T2:UNKNOWN_SITE']`).

## Test corrections (spec wins over test)

- Case 1 variant: the test appends `T0` (eventKey `X1`, identical to `T1`), which makes `T0`
  the kept record and `T1` a duplicate-flagged row, while the golden `T6` still reversed
  `T1`. Spec, "Minimal schema and deterministic contract": "A reversal must reference one
  nonduplicate dispense ... malformed reversal rejects atomically", and case 4: "unknown/
  duplicate target ... rejects". The engine correctly rejected (`INVALID_REVERSAL`). The test
  now sets `a.transactions[5].reversesId = 'T0'` so the reversal targets the kept record; all
  original assertions (two `DUPLICATE_EVENT` findings on `T1` and `T5` citing `T0`,
  order-independence, `duplicateRows === 2`) are kept unchanged.
- Case 5 site-mismatch variant: the test moved `T1` and `T6` to site `H2` but left the
  field-identical duplicate `T5` at `H1`. Spec: "Require duplicate eventKey records to be
  otherwise field-identical excluding transactionId; conflicting duplicates reject." The
  engine correctly rejected (`CONFLICTING_DUPLICATE`), so `.report` was undefined. The test
  now also sets `s.transactions[4].siteId = 'H2'`; the assertion that
  `T1:EVIDENCE_SITE_MISMATCH` is produced is unchanged.

No assertion was removed or loosened.

## UI status

- `app/` imports `../src/index.js` and `../fixtures/index.js` directly as ESM. Flow: choose a
  bundled synthetic seed (seeded-only; paste/import removed 2026-11-03 21:50 local, see
  `app/ui.js` + `tests/ui.test.js`) -> `reconcileText` -> atomic error list or report -> raw versus
  accepted ledger totals and counts -> rows table with duplicate/reversal lineage -> findings
  worklist filtered by rule (including an "unresolved evidence" view), row status and
  decision -> drill-down (cited transaction, linked evidence label, site window, rule text,
  lineage) -> decision and note via the immutable review layer -> JSON export
  (`buildExport` with browser SHA-256 of the raw text, `serializeExport` 10 MiB cap) and
  formula-safe CSV (`buildFindingsCsv`). All DOM text via `textContent`/`createElement`; no
  `innerHTML`, no `eval`, no external URLs, fonts or CDNs; CSP meta tag and server header.
- Verified in this session: `node --check` on `app/app.js` and `scripts/serve.mjs`; loopback
  HTTP smoke test (200 for `/`, `/app/app.js`, `/app/styles.css`, `/src/index.js`,
  `/fixtures/index.js`; 404 for `/package.json`, `/tests/helpers.js`, encoded traversal and a
  missing file; CSP header present; server exited on SIGTERM with no leftover process); a
  headless Node run of the exact engine call sequence the page uses for every fixture.
- NOT verified: rendering in a real browser, mobile layout, keyboard flow and download
  behaviour. Browser evidence per the website playbook remains UNVERIFIED (no browser tooling
  was used within the time budget). Playbook rubric status: Point of view / Typography /
  Colour / Hierarchy / Mobile designed in CSS tokens but UNVERIFIED by inspection; Imagery
  NOT APPLICABLE (no media); Motion intentionally minimal (hover transition only under
  `prefers-reduced-motion: no-preference`).

## Known limitations and not done

- No browser-based automated tests for the worklist or export; only Node tests exist.
- No persistence, authentication, tenancy or deployment; review notes live in page memory.
- Synthetic demonstration only: no real Medicaid, NDC normalization, partial reversals,
  contract-pharmacy policy, patient definition, effective-dated eligibility or manufacturer
  terms (spec "Journey, evidence and limits").
- No git operations, CI files, dependencies or network access were added (root handles git).
