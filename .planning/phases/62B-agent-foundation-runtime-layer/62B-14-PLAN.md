---
phase: 62B
plan: 14
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/seed-62b-lineage-demo.mjs
  - scripts/unseed-62b-lineage-demo.mjs
  - .planning/phases/62B-agent-foundation-runtime-layer/62B-14-SEED-NOTES.md
autonomous: true
gap_closure: true
requirements: [OBS-02]
must_haves:
  truths:
    - "After running scripts/seed-62b-lineage-demo.mjs, fees_published contains at least 10 rows where source = 'lineage_demo_62b_14'"
    - "Every seeded fees_published row has a valid lineage chain: fees_published.lineage_ref → fees_verified.fee_verified_id → fees_raw.fee_raw_id"
    - "Every seeded fees_published row resolves cleanly through lineage_graph(id) — no tier_1_missing or tier_2_missing errors"
    - "Running scripts/seed-62b-lineage-demo.mjs a second time does NOT produce duplicate rows (idempotent guard)"
    - "Running scripts/unseed-62b-lineage-demo.mjs removes all rows marked with the demo sentinel AND prints a row count summary"
    - "Seed data is clearly marked (fee_name prefix 'DEMO: ', source = 'lineage_demo_62b_14') so it is never mistaken for real pipeline output"
  artifacts:
    - path: scripts/seed-62b-lineage-demo.mjs
      provides: "Idempotent seed script that inserts 10 full-lineage demo fees (raw → verified → published) with a sentinel marker"
    - path: scripts/unseed-62b-lineage-demo.mjs
      provides: "Reversal script that deletes only rows with the sentinel marker"
    - path: .planning/phases/62B-agent-foundation-runtime-layer/62B-14-SEED-NOTES.md
      provides: "Operator notes: why this exists, how to run, how to reverse, who should delete"
  key_links:
    - from: "fees_published.canonical_fee_key + fee_name"
      to: "sentinel for idempotence + reversal"
      via: "fee_name LIKE 'DEMO: %' AND canonical_fee_key = '__demo_62b_14__'"
      pattern: "DEMO:"
    - from: "fees_raw.source column"
      to: "reversal filter"
      via: "source = 'lineage_demo_62b_14'"
      pattern: "lineage_demo_62b_14"
---

<objective>
Close UAT Gap 6a — fees_published has 0 rows, so the Lineage UI has no trace targets regardless of how good Plan 62B-13's picker is. Seed 10 full-lineage demo rows so UAT Test 6 can be re-run end-to-end.

Purpose: The real pipeline (Darwin → Knox → Hamilton) hasn't promoted any fees_raw (102,965 rows exist) to fees_verified, let alone fees_published. That's a Phase 63/64 concern — this plan does NOT touch the pipeline. Instead it creates a narrow, sentinel-marked seed script that injects 10 hand-crafted lineage chains for UAT.

Every seeded row is marked with `source = 'lineage_demo_62b_14'` and `fee_name LIKE 'DEMO: %'` so it cannot be mistaken for real data, and so the reversal script can remove it cleanly.

Output: Two idempotent scripts (seed + unseed) plus operator notes. The seed runs directly against `DATABASE_URL` using the existing `scripts/apply-drift.mjs` pattern (postgres client + dotenv). No new migrations — this is data, not schema.

Constraints honored:
- fees_published is INSERT-only by table contract — no UPDATE/DELETE tools. The unseed script performs direct DELETE via `DATABASE_URL` admin connection (same escape hatch used by ops scripts).
- Every row must satisfy the FK chain: fees_published.lineage_ref → fees_verified.fee_verified_id → fees_raw.fee_raw_id
- The existing promote_to_tier3 stub will NOT be used (it requires an adversarial handshake that hasn't been exercised). Direct INSERTs with synthetic agent_event_ids.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/62B-agent-foundation-runtime-layer/62B-CONTEXT.md
@.planning/phases/62B-agent-foundation-runtime-layer/62B-UAT.md
@supabase/migrations/20260420_fees_tier_tables.sql

<interfaces>
Schema reference (from supabase/migrations/20260420_fees_tier_tables.sql):

fees_raw columns:
- fee_raw_id BIGSERIAL PK
- institution_id INTEGER NOT NULL
- crawl_event_id INTEGER (nullable)
- document_r2_key TEXT (nullable)
- source_url TEXT (nullable)
- extraction_confidence NUMERIC(5,4)
- agent_event_id UUID NOT NULL (sentinel 00000000-0000-0000-0000-000000000000 allowed)
- fee_name TEXT NOT NULL
- amount NUMERIC(12,2)
- frequency TEXT
- conditions TEXT
- outlier_flags JSONB DEFAULT '[]'
- source TEXT DEFAULT 'knox' CHECK IN ('knox','migration_v10','manual_import')
  ← NOTE: 'lineage_demo_62b_14' is NOT in the check list. Options:
      (a) Use an allowed value ('manual_import' is the closest semantic match) AND mark via fee_name prefix + outlier_flags tag
      (b) ALTER TABLE to widen the check — too invasive for a demo
  Use option (a): `source = 'manual_import'`, add `outlier_flags = '["demo_62b_14"]'::jsonb` sentinel.

fees_verified columns:
- fee_verified_id BIGSERIAL PK
- fee_raw_id BIGINT NOT NULL FK → fees_raw
- institution_id INTEGER NOT NULL
- canonical_fee_key TEXT NOT NULL
- variant_type TEXT
- outlier_flags JSONB DEFAULT '[]'
- verified_by_agent_event_id UUID NOT NULL
- fee_name TEXT NOT NULL
- amount NUMERIC(12,2)
- frequency TEXT
- review_status TEXT DEFAULT 'verified' CHECK IN ('verified','challenged','rejected','approved')

fees_published columns:
- fee_published_id BIGSERIAL PK
- lineage_ref BIGINT NOT NULL FK → fees_verified(fee_verified_id)
- institution_id INTEGER NOT NULL
- canonical_fee_key TEXT NOT NULL
- source_url TEXT
- document_r2_key TEXT
- extraction_confidence NUMERIC(5,4)
- agent_event_id UUID (nullable — Knox's extract event)
- verified_by_agent_event_id UUID (nullable — Darwin's verification event)
- published_by_adversarial_event_id UUID NOT NULL (use a sentinel UUID)
- fee_name TEXT NOT NULL
- amount NUMERIC(12,2)
- frequency TEXT
- variant_type TEXT
- coverage_tier TEXT CHECK IN ('strong','provisional','insufficient', NULL)

institutions: assumed to exist with id column. If absent, seed uses hard-coded institution_id values 1..10 and the fk is un-enforced (per migration comment).

Sentinel markers (for idempotence + reversal):
- fees_raw: outlier_flags JSONB contains "demo_62b_14"
- fees_verified: canonical_fee_key = '__demo_62b_14__'
- fees_published: fee_name LIKE 'DEMO: %' AND canonical_fee_key = '__demo_62b_14__'

The demo sentinel UUID for agent_event_id fields: `'00000000-0000-0000-0000-dead62b14aaa'` (recognizable, valid UUID format). Same for verified_by_agent_event_id and published_by_adversarial_event_id.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Create scripts/seed-62b-lineage-demo.mjs (idempotent seed with FK chain)</name>
  <files>scripts/seed-62b-lineage-demo.mjs</files>
  <read_first>
    - supabase/migrations/20260420_fees_tier_tables.sql (confirm column names + CHECK constraints)
    - scripts/apply-drift.mjs (reference for postgres client usage pattern)
    - scripts/apply-62b-migrations.mjs (reference for error handling + summary output pattern)
  </read_first>
  <action>
    Create `scripts/seed-62b-lineage-demo.mjs` with this exact content:

    ```javascript
    /**
     * Phase 62B-14 — Seed demo lineage chains for UAT Gap 6a.
     *
     * Inserts 10 full-lineage rows (fees_raw → fees_verified → fees_published)
     * so the Lineage tab at /admin/agents/lineage has trace targets while the
     * real pipeline (Phase 63/64) has not yet produced any promoted fees.
     *
     * Idempotent: re-running does NOT duplicate.
     * Reversible: run scripts/unseed-62b-lineage-demo.mjs to remove.
     *
     * Sentinels for identification + reversal:
     *   fees_raw.outlier_flags       → contains "demo_62b_14"
     *   fees_verified.canonical_fee_key = '__demo_62b_14__'
     *   fees_published.fee_name LIKE 'DEMO: %' AND canonical_fee_key = '__demo_62b_14__'
     *
     * Usage:
     *   node scripts/seed-62b-lineage-demo.mjs
     */

    import postgres from "postgres";
    import "dotenv/config";

    if (!process.env.DATABASE_URL) {
      console.error("DATABASE_URL not set; aborting.");
      process.exit(2);
    }

    const DEMO_CANONICAL = "__demo_62b_14__";
    const DEMO_UUID = "00000000-0000-0000-0000-dead62b14aaa";

    // 10 hand-crafted rows. Hard-coded institution_ids (1..10) — migration comment
    // notes institution_id FK is not enforced at the table level.
    const DEMO_FEES = [
      { institution_id: 1, fee_name: "DEMO: Monthly Maintenance", amount: 12.00, frequency: "monthly" },
      { institution_id: 2, fee_name: "DEMO: Overdraft",           amount: 35.00, frequency: "per_event" },
      { institution_id: 3, fee_name: "DEMO: NSF",                 amount: 34.00, frequency: "per_event" },
      { institution_id: 4, fee_name: "DEMO: ATM Non-Network",     amount: 3.00,  frequency: "per_use" },
      { institution_id: 5, fee_name: "DEMO: Foreign Transaction", amount: 0.03,  frequency: "per_txn" },
      { institution_id: 6, fee_name: "DEMO: Wire Domestic Out",   amount: 25.00, frequency: "per_event" },
      { institution_id: 7, fee_name: "DEMO: Stop Payment",        amount: 30.00, frequency: "per_event" },
      { institution_id: 8, fee_name: "DEMO: Paper Statement",     amount: 3.00,  frequency: "monthly" },
      { institution_id: 9, fee_name: "DEMO: Returned Deposit",    amount: 12.00, frequency: "per_event" },
      { institution_id: 10, fee_name: "DEMO: Cashiers Check",     amount: 10.00, frequency: "per_event" },
    ];

    const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

    try {
      // Idempotence check — skip insertion if sentinel rows already exist.
      const existing = await sql`
        SELECT COUNT(*)::int AS n FROM fees_published
         WHERE canonical_fee_key = ${DEMO_CANONICAL}
      `;
      if (existing[0].n > 0) {
        console.log(`Seed already present: ${existing[0].n} demo rows in fees_published. No-op.`);
        await sql.end();
        process.exit(0);
      }

      let rawInserted = 0;
      let verifiedInserted = 0;
      let publishedInserted = 0;

      await sql.begin(async (tx) => {
        for (const fee of DEMO_FEES) {
          // Tier 1 — fees_raw (source='manual_import' is allowed by CHECK constraint)
          const rawRow = await tx`
            INSERT INTO fees_raw (
              institution_id, document_r2_key, source_url, extraction_confidence,
              agent_event_id, fee_name, amount, frequency, outlier_flags, source
            ) VALUES (
              ${fee.institution_id},
              ${"demo/62b14/" + fee.institution_id + ".pdf"},
              ${"https://example.com/demo/" + fee.institution_id + "/schedule"},
              ${0.95},
              ${DEMO_UUID}::UUID,
              ${fee.fee_name},
              ${fee.amount},
              ${fee.frequency},
              ${'["demo_62b_14"]'}::jsonb,
              ${"manual_import"}
            )
            RETURNING fee_raw_id
          `;
          const feeRawId = rawRow[0].fee_raw_id;
          rawInserted++;

          // Tier 2 — fees_verified (canonical_fee_key = sentinel)
          const verifiedRow = await tx`
            INSERT INTO fees_verified (
              fee_raw_id, institution_id, source_url, document_r2_key,
              extraction_confidence, canonical_fee_key, variant_type, outlier_flags,
              verified_by_agent_event_id, fee_name, amount, frequency, review_status
            ) VALUES (
              ${feeRawId},
              ${fee.institution_id},
              ${"https://example.com/demo/" + fee.institution_id + "/schedule"},
              ${"demo/62b14/" + fee.institution_id + ".pdf"},
              ${0.95},
              ${DEMO_CANONICAL},
              ${"demo"},
              ${'["demo_62b_14"]'}::jsonb,
              ${DEMO_UUID}::UUID,
              ${fee.fee_name},
              ${fee.amount},
              ${fee.frequency},
              ${"verified"}
            )
            RETURNING fee_verified_id
          `;
          const feeVerifiedId = verifiedRow[0].fee_verified_id;
          verifiedInserted++;

          // Tier 3 — fees_published (direct INSERT; bypass promote_to_tier3 stub)
          await tx`
            INSERT INTO fees_published (
              lineage_ref, institution_id, canonical_fee_key,
              source_url, document_r2_key, extraction_confidence,
              agent_event_id, verified_by_agent_event_id, published_by_adversarial_event_id,
              fee_name, amount, frequency, variant_type, coverage_tier
            ) VALUES (
              ${feeVerifiedId},
              ${fee.institution_id},
              ${DEMO_CANONICAL},
              ${"https://example.com/demo/" + fee.institution_id + "/schedule"},
              ${"demo/62b14/" + fee.institution_id + ".pdf"},
              ${0.95},
              ${DEMO_UUID}::UUID,
              ${DEMO_UUID}::UUID,
              ${DEMO_UUID}::UUID,
              ${fee.fee_name},
              ${fee.amount},
              ${fee.frequency},
              ${"demo"},
              ${"provisional"}
            )
          `;
          publishedInserted++;
        }
      });

      // Summary
      const summary = await sql`
        SELECT
          (SELECT COUNT(*)::int FROM fees_raw WHERE outlier_flags ? 'demo_62b_14') AS raw_rows,
          (SELECT COUNT(*)::int FROM fees_verified WHERE canonical_fee_key = ${DEMO_CANONICAL}) AS verified_rows,
          (SELECT COUNT(*)::int FROM fees_published WHERE canonical_fee_key = ${DEMO_CANONICAL}) AS published_rows
      `;
      console.log(`Inserted (this run): raw=${rawInserted} verified=${verifiedInserted} published=${publishedInserted}`);
      console.log(`Total present:       raw=${summary[0].raw_rows} verified=${summary[0].verified_rows} published=${summary[0].published_rows}`);
      console.log(`Reverse with:        node scripts/unseed-62b-lineage-demo.mjs`);
    } catch (err) {
      console.error("SEED FAILED:", err.message);
      process.exitCode = 1;
    } finally {
      await sql.end();
    }
    ```

    Key behaviors:
    - Idempotent: checks `fees_published WHERE canonical_fee_key = '__demo_62b_14__'` before inserting; no-op if already present
    - Transactional: all 30 inserts (10 raw + 10 verified + 10 published) happen in one `sql.begin` transaction — either all land or none do
    - FK chain preserved: raw → verified (via fee_raw_id), verified → published (via lineage_ref = fee_verified_id)
    - Sentinel-marked in all 3 tiers for clean reversal
    - Prints a summary showing counts before exit
  </action>
  <verify>
    <automated>node -e "import('./scripts/seed-62b-lineage-demo.mjs').catch(e => { if (/DATABASE_URL/.test(e.message)) { console.log('EXPECTED: script enforces DATABASE_URL'); process.exit(0); } else { console.error(e); process.exit(1); } })" && grep -c "DEMO_CANONICAL" scripts/seed-62b-lineage-demo.mjs && grep -c "INSERT INTO fees_raw" scripts/seed-62b-lineage-demo.mjs && grep -c "INSERT INTO fees_verified" scripts/seed-62b-lineage-demo.mjs && grep -c "INSERT INTO fees_published" scripts/seed-62b-lineage-demo.mjs</automated>
  </verify>
  <acceptance_criteria>
    - File exists: `test -f scripts/seed-62b-lineage-demo.mjs` exits 0
    - Parses as valid ESM: `node --check scripts/seed-62b-lineage-demo.mjs` exits 0
    - `grep -c "__demo_62b_14__" scripts/seed-62b-lineage-demo.mjs` returns >= 3
    - `grep -c "INSERT INTO fees_raw" scripts/seed-62b-lineage-demo.mjs` returns 1
    - `grep -c "INSERT INTO fees_verified" scripts/seed-62b-lineage-demo.mjs` returns 1
    - `grep -c "INSERT INTO fees_published" scripts/seed-62b-lineage-demo.mjs` returns 1
    - `grep -c "sql.begin" scripts/seed-62b-lineage-demo.mjs` returns 1 (transactional)
    - `grep -c "DATABASE_URL not set" scripts/seed-62b-lineage-demo.mjs` returns 1 (env guard)
    - `grep -c "DEMO:" scripts/seed-62b-lineage-demo.mjs` returns >= 10 (one per fee row)
    - `grep -c "manual_import" scripts/seed-62b-lineage-demo.mjs` returns 1 (CHECK-compliant source)
    - Idempotence check present: `grep -c "Seed already present" scripts/seed-62b-lineage-demo.mjs` returns 1
  </acceptance_criteria>
  <done>Seed script present, parses cleanly, uses correct column names per fees_tier_tables.sql, transactional, idempotent, sentinel-marked.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Create scripts/unseed-62b-lineage-demo.mjs (reversal script)</name>
  <files>scripts/unseed-62b-lineage-demo.mjs</files>
  <read_first>
    - scripts/seed-62b-lineage-demo.mjs (after Task 1 — confirm sentinel markers)
  </read_first>
  <action>
    Create `scripts/unseed-62b-lineage-demo.mjs` with this exact content:

    ```javascript
    /**
     * Phase 62B-14 — Reverse the lineage demo seed.
     *
     * Deletes only rows matching the 62B-14 sentinels:
     *   fees_published WHERE canonical_fee_key = '__demo_62b_14__'
     *   fees_verified  WHERE canonical_fee_key = '__demo_62b_14__'
     *   fees_raw       WHERE outlier_flags ? 'demo_62b_14'
     *
     * Order matters — published first (FK to verified), verified next (FK to raw),
     * raw last. This is the safe reversal of the seed order.
     *
     * Usage:
     *   node scripts/unseed-62b-lineage-demo.mjs
     */

    import postgres from "postgres";
    import "dotenv/config";

    if (!process.env.DATABASE_URL) {
      console.error("DATABASE_URL not set; aborting.");
      process.exit(2);
    }

    const DEMO_CANONICAL = "__demo_62b_14__";

    const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

    try {
      let published = 0;
      let verified = 0;
      let raw = 0;

      await sql.begin(async (tx) => {
        const p = await tx`
          DELETE FROM fees_published
           WHERE canonical_fee_key = ${DEMO_CANONICAL}
          RETURNING 1
        `;
        published = p.length;

        const v = await tx`
          DELETE FROM fees_verified
           WHERE canonical_fee_key = ${DEMO_CANONICAL}
          RETURNING 1
        `;
        verified = v.length;

        const r = await tx`
          DELETE FROM fees_raw
           WHERE outlier_flags ? 'demo_62b_14'
          RETURNING 1
        `;
        raw = r.length;
      });

      console.log(`Unseed complete: published=${published} verified=${verified} raw=${raw}`);
      if (published === 0 && verified === 0 && raw === 0) {
        console.log("Nothing to remove — seed was not present.");
      }
    } catch (err) {
      console.error("UNSEED FAILED:", err.message);
      process.exitCode = 1;
    } finally {
      await sql.end();
    }
    ```
  </action>
  <verify>
    <automated>node --check scripts/unseed-62b-lineage-demo.mjs && grep -c "DELETE FROM fees_published" scripts/unseed-62b-lineage-demo.mjs && grep -c "DELETE FROM fees_verified" scripts/unseed-62b-lineage-demo.mjs && grep -c "DELETE FROM fees_raw" scripts/unseed-62b-lineage-demo.mjs && grep -c "__demo_62b_14__" scripts/unseed-62b-lineage-demo.mjs</automated>
  </verify>
  <acceptance_criteria>
    - File exists: `test -f scripts/unseed-62b-lineage-demo.mjs` exits 0
    - Parses as valid ESM: `node --check scripts/unseed-62b-lineage-demo.mjs` exits 0
    - `grep -c "DELETE FROM fees_published" scripts/unseed-62b-lineage-demo.mjs` returns 1
    - `grep -c "DELETE FROM fees_verified" scripts/unseed-62b-lineage-demo.mjs` returns 1
    - `grep -c "DELETE FROM fees_raw" scripts/unseed-62b-lineage-demo.mjs` returns 1
    - `grep -c "__demo_62b_14__" scripts/unseed-62b-lineage-demo.mjs` returns >= 1
    - `grep -c "demo_62b_14" scripts/unseed-62b-lineage-demo.mjs` returns >= 2
    - `grep -c "sql.begin" scripts/unseed-62b-lineage-demo.mjs` returns 1 (transactional)
    - Delete order in file: `fees_published` appears before `fees_verified` which appears before `fees_raw` (reverse FK order). Verify with `grep -n "DELETE FROM" scripts/unseed-62b-lineage-demo.mjs` — line numbers should ascend: published < verified < raw
    - NO unqualified DELETE (no `DELETE FROM fees_published;` without WHERE). Verify `grep -c "DELETE FROM fees_\(raw\|verified\|published\) WHERE" scripts/unseed-62b-lineage-demo.mjs` returns 3
    - `grep -c "DATABASE_URL not set" scripts/unseed-62b-lineage-demo.mjs` returns 1
  </acceptance_criteria>
  <done>Unseed script present, parses cleanly, uses sentinel filters only, transactional, proper FK-respecting delete order.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Write operator notes explaining the seed</name>
  <files>.planning/phases/62B-agent-foundation-runtime-layer/62B-14-SEED-NOTES.md</files>
  <read_first>
    - scripts/seed-62b-lineage-demo.mjs (after Task 1)
    - scripts/unseed-62b-lineage-demo.mjs (after Task 2)
  </read_first>
  <action>
    Create `.planning/phases/62B-agent-foundation-runtime-layer/62B-14-SEED-NOTES.md` with this exact content:

    ```markdown
    # 62B-14 — Lineage Demo Seed

    ## Why this exists

    UAT Test 6 (Lineage tab valid ID) could not be verified because `fees_published`
    had 0 rows. The real pipeline (Darwin → Knox → Hamilton) has not yet promoted
    any `fees_raw` (102,965 rows) to `fees_verified`, let alone `fees_published`.
    That's Phase 63/64 work — this seed is a narrow UAT unblock, not a pipeline
    patch.

    ## What it does

    Inserts 10 full-lineage chains:
    - 10 rows in `fees_raw` marked with `outlier_flags @> '["demo_62b_14"]'`
    - 10 rows in `fees_verified` with `canonical_fee_key = '__demo_62b_14__'`
    - 10 rows in `fees_published` with the same canonical_fee_key + `fee_name` prefix `DEMO: `

    Every row uses the sentinel UUID `00000000-0000-0000-0000-dead62b14aaa` for
    `agent_event_id`, `verified_by_agent_event_id`, and
    `published_by_adversarial_event_id` — easy to spot, easy to query.

    ## How to run

    ```bash
    # from repo root, with DATABASE_URL set in .env
    node scripts/seed-62b-lineage-demo.mjs
    ```

    Output:
    ```
    Inserted (this run): raw=10 verified=10 published=10
    Total present:       raw=10 verified=10 published=10
    Reverse with:        node scripts/unseed-62b-lineage-demo.mjs
    ```

    Re-running is idempotent — it detects existing sentinels and no-ops.

    ## How to reverse

    ```bash
    node scripts/unseed-62b-lineage-demo.mjs
    ```

    Deletes rows in reverse FK order (published → verified → raw) matching the
    sentinels. Safe to run even if seed was never applied — prints
    "Nothing to remove".

    ## When to delete

    **Delete as soon as Phase 63 or 64 produces real `fees_published` rows.**

    Demo rows are clearly marked (`DEMO: ` prefix, `__demo_62b_14__` canonical
    key) but still risk polluting:
    - Hamilton queries that filter by canonical_fee_key
    - Admin /market / /national index pages that aggregate fees_published
    - Any downstream consumer that treats fees_published as authoritative

    The seed is temporary scaffolding for Lineage UAT. It is not a substitute
    for pipeline promotion.

    ## Invariants

    - Every seeded `fees_published` row resolves cleanly through
      `lineage_graph(id)` — no `tier_1_missing` or `tier_2_missing` errors
    - Every FK chain is intact: published.lineage_ref → verified.fee_verified_id → raw.fee_raw_id
    - `institution_id` values 1..10 are used; migration comment notes the FK is
      not enforced so these need not exist in `institutions`
    - `source` is set to `'manual_import'` because the `fees_raw.source` CHECK
      constraint only allows `('knox','migration_v10','manual_import')`

    ## Related

    - UAT gap: `.planning/phases/62B-agent-foundation-runtime-layer/62B-UAT.md` Test 6
    - Lineage UX fix: Plan 62B-13 (RecentPicker + JSON leak fix)
    - Real pipeline: Phase 63 (Knox), Phase 64 (Darwin)
    ```
  </action>
  <verify>
    <automated>test -f .planning/phases/62B-agent-foundation-runtime-layer/62B-14-SEED-NOTES.md && grep -c "## Why this exists" .planning/phases/62B-agent-foundation-runtime-layer/62B-14-SEED-NOTES.md && grep -c "## How to run" .planning/phases/62B-agent-foundation-runtime-layer/62B-14-SEED-NOTES.md && grep -c "## How to reverse" .planning/phases/62B-agent-foundation-runtime-layer/62B-14-SEED-NOTES.md && grep -c "## When to delete" .planning/phases/62B-agent-foundation-runtime-layer/62B-14-SEED-NOTES.md</automated>
  </verify>
  <acceptance_criteria>
    - File exists: `test -f .planning/phases/62B-agent-foundation-runtime-layer/62B-14-SEED-NOTES.md` exits 0
    - Contains sections: `## Why this exists`, `## What it does`, `## How to run`, `## How to reverse`, `## When to delete`, `## Invariants`, `## Related`
    - `grep -c "__demo_62b_14__"` returns >= 1
    - `grep -c "DEMO:" ` returns >= 1
    - `grep -c "Phase 63"` returns >= 1 (points to the real-pipeline follow-up)
  </acceptance_criteria>
  <done>Operator notes present and link back to UAT, plans 62B-13, and the pipeline phases.</done>
</task>

</tasks>

<verification>
## Overall Phase Checks

```bash
node --check scripts/seed-62b-lineage-demo.mjs
node --check scripts/unseed-62b-lineage-demo.mjs
test -f .planning/phases/62B-agent-foundation-runtime-layer/62B-14-SEED-NOTES.md
grep -c "INSERT INTO fees_\(raw\|verified\|published\)" scripts/seed-62b-lineage-demo.mjs
grep -c "DELETE FROM fees_\(raw\|verified\|published\) WHERE" scripts/unseed-62b-lineage-demo.mjs
```

Expected:
- Both scripts parse cleanly
- Notes file exists
- Seed has 3 INSERTs (one per tier)
- Unseed has 3 DELETEs, all with WHERE

## Manual verification post-execution (user runs seed)

```bash
node scripts/seed-62b-lineage-demo.mjs
# Expected output:
# Inserted (this run): raw=10 verified=10 published=10
# Total present:       raw=10 verified=10 published=10

# Idempotence — second run:
node scripts/seed-62b-lineage-demo.mjs
# Expected:
# Seed already present: 10 demo rows in fees_published. No-op.

# Reversal:
node scripts/unseed-62b-lineage-demo.mjs
# Expected:
# Unseed complete: published=10 verified=10 raw=10
```

After seed applied, UAT Test 6 becomes re-runnable end-to-end via 62B-13's RecentPicker.

## Database state invariants (post-seed)

- `SELECT COUNT(*) FROM fees_published WHERE canonical_fee_key = '__demo_62b_14__'` returns 10
- `SELECT lineage_graph(fee_published_id) FROM fees_published WHERE canonical_fee_key = '__demo_62b_14__' LIMIT 1` returns a valid JSONB tree (no error payload)
</verification>

<success_criteria>
- Seed script created, parses, uses correct columns + CHECK-compliant source
- Unseed script created, parses, uses sentinel filters
- Operator notes cover why / how / reverse / when to delete
- No schema changes (pure data + scripts)
- UAT Gap 6a unblocked: fees_published will have >= 10 rows after seed runs
- Plan 62B-13's RecentPicker will render real rows once seed is applied
</success_criteria>

<output>
After completion, create `.planning/phases/62B-agent-foundation-runtime-layer/62B-14-SUMMARY.md` documenting:
- seed-62b-lineage-demo.mjs created (10 fees_raw + 10 fees_verified + 10 fees_published, idempotent, transactional)
- unseed-62b-lineage-demo.mjs created (sentinel-filtered DELETEs in reverse FK order)
- 62B-14-SEED-NOTES.md operator reference created
- Files touched: 3 (all new)
- Gap 6a closed: Lineage UI has trace targets after `node scripts/seed-62b-lineage-demo.mjs`
</output>
