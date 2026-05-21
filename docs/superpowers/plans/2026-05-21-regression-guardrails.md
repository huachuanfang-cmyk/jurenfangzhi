# Regression Guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a lightweight guard command that catches core ERP flow regressions and schema/data consistency risks before changes are trusted.

**Architecture:** Keep the current single-page ERP intact. Add Node-based guard scripts under `tools/guard/` that run in isolation, use test-only in-memory data, and inspect local source/schema files without writing real business data.

**Tech Stack:** Node.js ESM, built-in `assert`, built-in `fs`, current `package.json` scripts.

---

## File Structure

- Create `tools/guard/erp-core.mjs`: test-only data model for the core ERP invariants.
- Create `tools/guard/regression-tests.mjs`: behavior tests for order, stock, shipment, return, receivable, and deletion semantics.
- Create `tools/guard/data-audit.mjs`: static audit for `TABLE_MAP`, schema coverage, and risky delete patterns.
- Create `tools/guard/run-guard.mjs`: runs regression tests and data audit together.
- Modify `package.json`: add `guard`, `guard:regression`, and `guard:audit` scripts.

## Task 1: Core Regression Model

**Files:**
- Create: `tools/guard/regression-tests.mjs`
- Create: `tools/guard/erp-core.mjs`

- [ ] **Step 1: Write the failing regression tests**

Create `tools/guard/regression-tests.mjs` with tests that import `createGuardStore` from `erp-core.mjs` and assert the seven first-stage flows.

- [ ] **Step 2: Run test to verify it fails**

Run: `node tools/guard/regression-tests.mjs`

Expected: FAIL with module not found or missing export.

- [ ] **Step 3: Write minimal implementation**

Create `tools/guard/erp-core.mjs` with an in-memory store and functions used only by the guard tests.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tools/guard/regression-tests.mjs`

Expected: PASS with a regression summary.

## Task 2: Static Data Audit

**Files:**
- Create: `tools/guard/data-audit.mjs`

- [ ] **Step 1: Write the failing audit**

Create a script that reads `index.html`, `supabase-schema.sql`, and extra SQL files, then checks:

- every table in `TABLE_MAP` exists in SQL files;
- `fg_returns` is reported missing from the main schema if absent;
- `color_notices` is reported as outside the main schema if only present in an add-on SQL file;
- raw `DB.* = DB.*.filter(...)` delete patterns are listed for review.

- [ ] **Step 2: Run audit to verify current findings**

Run: `node tools/guard/data-audit.mjs`

Expected: exits non-zero while current schema/delete risks remain.

- [ ] **Step 3: Keep audit read-only**

Ensure the audit reports findings but does not edit `index.html`, SQL files, or real data.

## Task 3: Guard Runner and NPM Scripts

**Files:**
- Create: `tools/guard/run-guard.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add runner**

Create `run-guard.mjs` that runs regression tests and audit in sequence and preserves failure exit codes.

- [ ] **Step 2: Add package scripts**

Add:

```json
{
  "scripts": {
    "guard": "node tools/guard/run-guard.mjs",
    "guard:regression": "node tools/guard/regression-tests.mjs",
    "guard:audit": "node tools/guard/data-audit.mjs"
  }
}
```

- [ ] **Step 3: Verify commands**

Run:

```powershell
npm run guard:regression
npm run guard:audit
npm run guard
```

Expected: regression passes; audit may fail until schema/delete risks are fixed, and this is an intentional first-stage warning.

## Task 4: Next Fix Candidates

**Files:**
- Modify later: `supabase-schema.sql`
- Modify later: `index.html`

- [ ] **Step 1: Use audit output to prioritize fixes**

Prioritize:

1. add `fg_returns` and `color_notices` to the main schema;
2. avoid disabling RLS for `color_notices`;
3. introduce a centralized delete helper before changing every delete call.

- [ ] **Step 2: Apply future fixes with TDD**

For each future fix, first update or add a guard test, verify it fails, then implement the smallest code/schema change.

