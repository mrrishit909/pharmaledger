# PharmaLedger: first executable synthetic slice

Deterministic reconciliation of labelled synthetic dispensing fixtures against the fictional
`pharma-reconcile-1` rule pack. Dependency-free Node 24 ESM. Spec: Project Atlas
`docs/specs/PHARMALEDGER-VERTICAL-SLICE.md`.

## Synthetic-only, fictional rules, no authority

- Every site, member, evidence record, transaction, finding and total in this repository is
  invented fixture data. There is no patient, facility, pharmacy or 340B data anywhere.
- `pharma-reconcile-1` is a fictional, versioned demo configuration transcribed from the spec.
  It is not derived from HRSA, state Medicaid or manufacturer policy and carries no legal,
  regulatory, clinical or 340B authority.
- "Accepted" means structurally included in reconciliation, never 340B-eligible. Monetary
  values are fixture transaction amounts, not savings or repayment.
- The demo reconciles configured synthetic relationships only. It cannot decide patient or
  site eligibility, prove duplicate discounts, authorize purchasing or certify compliance.
  No Medicaid duplicate-discount inference exists in this slice.

## Run

```
npm test          # node --test "tests/**/*.test.js"
npm run serve     # node scripts/serve.mjs  -> http://127.0.0.1:8787/ (loopback only)
PORT=9000 npm run serve
```

The server binds 127.0.0.1 only, serves `app/`, `src/` and `fixtures/` as static files,
makes no network fetches and accepts no uploads. Stop it with Ctrl+C. The page in `app/`
imports the real engine from `src/` as ESM modules; no bundler, no external fonts or CDNs.

## Input contract (`pharma-demo-1`)

```json
{ "schemaVersion": "pharma-demo-1", "ruleVersion": "pharma-reconcile-1",
  "sites": [{ "siteId": "H1", "validFrom": "2026-01-01", "validThrough": "2026-12-31" }],
  "evidence": [{ "evidenceId": "E1", "memberId": "M1", "siteId": "H1", "illustrativeEligibility": "yes" }],
  "transactions": [{ "transactionId": "T1", "eventKey": "X1", "memberId": "M1", "siteId": "H1",
    "evidenceId": "E1", "dispenseDate": "2026-03-10", "kind": "dispense",
    "quantityUnits": 10, "amountCents": 10000, "reversesId": null }] }
```

- `schemaVersion` must be `pharma-demo-1`; `ruleVersion`, if present, must be `pharma-reconcile-1`.
- Sites: unique `siteId`; inclusive `validFrom`/`validThrough` calendar dates (`YYYY-MM-DD`, real
  calendar days; `2026-02-30` rejects).
- Evidence: unique `evidenceId`; opaque `memberId`; `siteId` must exist in `sites`;
  `illustrativeEligibility` is `yes|no|unknown` and is a supplied fixture label only.
- Transactions: unique `transactionId`; opaque `eventKey`, `memberId`, `siteId` (an unknown
  transaction site is a finding, not a schema error); `evidenceId` existing or `null`;
  `kind` `dispense|reversal`; `quantityUnits` positive integer <= 1,000,000; `amountCents`
  non-negative integer <= 1,000,000,000; `reversesId` `null` or an existing dispense ID.
- Bounds: 1 MiB raw text, nesting depth 8, 1,000 sites, 2,000 evidence records, 5,000
  transactions, 200-character identifiers, 2,000-character reviewer notes, 10 MiB export.
- Validation is atomic: any error returns `{ ok: false, errors: [{ code, path, message }] }`
  with no partial report. Numbers must be JSON integers; strings such as `"10000"` reject.

## Rule pack summary (`pharma-reconcile-1`, fictional)

- `DUPLICATE_EVENT`: exact `eventKey` repetition flags the later lexicographic transaction IDs.
  Duplicates must be field-identical except `transactionId`; conflicting repeats reject.
  Duplicate rows stay visible but are excluded from accepted totals and rule evaluation.
- Reversals must reference one non-duplicate dispense, match member/site/quantity/amount,
  carry a distinct `eventKey`, and not reverse an already reversed row; otherwise reject.
  No partial reversals or negative stock are invented.
- Accepted dispense rows only: `UNKNOWN_SITE` or `SITE_OUTSIDE_DEMO_WINDOW`; `MISSING_EVIDENCE`
  when `evidenceId` is null; for linked evidence `EVIDENCE_MEMBER_MISMATCH`,
  `EVIDENCE_SITE_MISMATCH`, `ILLUSTRATIVE_INELIGIBLE` (label `no`), `ELIGIBILITY_UNRESOLVED`
  (label `unknown`). Findings never alter accepted totals and are retained for reversed
  dispenses with status `reversed`.

## Report shape

`reconcile(data)` / `reconcileText(text)` return `{ ok: true, report }` where `report` is
deep-frozen:

- `schemaVersion`, `ruleVersion`, `rulePack` (rules + provenance), `syntheticData: true`,
  `syntheticLabel`, `acceptedMeaning`.
- `input`: the supplied records, sorted by ID, otherwise untouched.
- `rows[]`: `{ record, status: accepted|reversed|duplicate, accepted, flagged, duplicateOf,
  reversedBy, findingIds }` sorted by `transactionId`.
- `findings[]`: `{ findingId: "<transactionId>:<ruleId>", ruleId, ruleVersion, transactionId,
  rowStatus, message, cites: { transactionId, memberId, siteId, evidenceId,
  duplicateOfTransactionId } }` sorted by transaction then rule.
- `summary.counts`: imported, duplicate, accepted, dispenses, reversals, reversed dispenses,
  flagged rows, findings, per-rule counts. `summary.totals.raw` (all imported rows) and
  `summary.totals.accepted` (after deduplication) are presented separately, computed with
  checked safe-integer arithmetic.

Golden oracle (fixtures `golden`): 6 imported rows, 1 duplicate, 5 accepted; 7 findings on
4 rows; raw signed cents 27,000; accepted gross 27,000, reversals 10,000, net 17,000;
accepted units 22 / 10 / 12; raw net units 22.

## Exports

- JSON (`buildExport` + `serializeExport`): export version, schema and rule versions, rule
  pack provenance, synthetic label, caller-supplied `generatedAt` and SHA-256 `sourceHash`
  of the raw input, input snapshot, summary, rows, findings, reviewer notes and decisions,
  disclaimer. Capped at 10 MiB.
- CSV (`buildFindingsCsv`): RFC 4180 with CRLF, one row per finding, a leading
  `synthetic demo data` column, decision and note columns. Cells starting with `= + - @`,
  tab or CR are prefixed with `'` and cells containing quotes, commas, CR, LF or tabs are
  quoted.

Reviewer notes and decisions live in a separate immutable layer (`createReviewLayer`,
`setNote`, `setDecision`) keyed by `findingId`; they never modify the frozen report.

## Workbench (`app/`)

Static HTML plus ESM modules: choose a bundled synthetic seed (seeded fixtures only; no file
import or paste in the public UI, per NEW-FRONTEND-PRELIMINARY-GATES), run the reconciliation, compare raw versus accepted figures, inspect row lineage (T5 duplicate, T6
reversal), filter findings by rule (including an "unresolved evidence" view), status and
decision, drill into the cited transaction, evidence, site window and rule text, record a
decision and note, and download JSON or CSV. All text is rendered with `textContent`.

## Limitations

- Synthetic public demonstration only; no real Medicaid, NDC normalization, partial reversal,
  contract-pharmacy policy, patient definition, effective-dated legal eligibility or
  manufacturer terms. Those need independently sourced specifications and qualified review.
- No persistence, authentication, tenancy or deployment; review notes live only in page
  memory until exported.
- The browser UI has not been exercised by automated browser tests in this checkout; only the
  Node test suite and a loopback HTTP smoke test were run. Visual and mobile checks remain
  unverified until inspected in a browser.
- Test results reported here are the project's own suite, not an independent audit.
