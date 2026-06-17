/**
 * Backfill `agent_event_id` on legacy `fees_raw` rows so Darwin can promote them.
 *
 * Problem: 102,965 fees_raw rows from `source = 'migration_v10'` have a zero-UUID
 * agent_event_id and `outlier_flags: ["lineage_missing"]`. Darwin's promotion gate
 * requires a real `verified_by_agent_event_id` on `fees_verified` (NOT NULL).
 * These rows are stranded.
 *
 * Fix: synthesize ONE backfill agent_event per institution (so lineage queries can
 * still distinguish migration_v10 from real extractions), update fees_raw to point
 * to it, and strip the `lineage_missing` flag.
 *
 * Idempotent. Safe to re-run. Use --dry-run to preview, --apply to commit.
 *
 * Usage:
 *   node -r dotenv/config scripts/backfill-migration-v10-lineage.mjs dotenv_config_path=.env --dry-run
 *   node -r dotenv/config scripts/backfill-migration-v10-lineage.mjs dotenv_config_path=.env --apply
 */
import postgres from "postgres";
import "dotenv/config";

const APPLY = process.argv.includes("--apply");
const DRY_RUN = !APPLY;
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

const sql = postgres(process.env.DATABASE_URL, { prepare: false });

async function main() {
  console.log(DRY_RUN ? "MODE: dry-run (no changes)" : "MODE: APPLY");

  const stranded = await sql`
    SELECT institution_id, COUNT(*)::int AS n
    FROM fees_raw
    WHERE source = 'migration_v10'
      AND agent_event_id = ${ZERO_UUID}::uuid
    GROUP BY institution_id
    ORDER BY n DESC
  `;
  const totalRows = stranded.reduce((a, r) => a + r.n, 0);
  console.log(`\nStranded rows: ${totalRows} across ${stranded.length} institutions`);
  if (stranded.length === 0) {
    console.log("Nothing to backfill. Exit.");
    await sql.end();
    return;
  }
  console.log(`Top 5 institutions by stranded row count:`);
  for (const r of stranded.slice(0, 5)) console.log(`  inst ${r.institution_id}: ${r.n} rows`);

  if (DRY_RUN) {
    console.log("\n[dry-run] Would:");
    console.log(`  1. Insert ${stranded.length} agent_events rows (agent_name='legacy_backfill', action='migration_v10_lineage')`);
    console.log(`  2. UPDATE ${totalRows} fees_raw rows to point agent_event_id at the new events`);
    console.log(`  3. Strip 'lineage_missing' from outlier_flags on those rows`);
    console.log("\nRerun with --apply to commit.");
    await sql.end();
    return;
  }

  // --- APPLY path: one transaction, per-institution backfill ---
  let totalUpdated = 0;
  let eventsCreated = 0;
  for (const { institution_id, n } of stranded) {
    await sql.begin(async (tx) => {
      // 1. Create a single backfill event for this institution.
      const [evt] = await tx`
        INSERT INTO agent_events (agent_name, action, tool_name, entity, entity_id, status, input_payload)
        VALUES (
          'legacy_backfill',
          'migration_v10_lineage',
          'backfill_script',
          'institution',
          ${String(institution_id)},
          'success',
          ${tx.json({ source: "migration_v10", rows_relinked: n, note: "Synthesized lineage for legacy import; original extraction predates agentic pipeline." })}
        )
        RETURNING event_id
      `;
      eventsCreated++;

      // 2. Relink all stranded rows for this institution.
      const updated = await tx`
        UPDATE fees_raw
        SET agent_event_id = ${evt.event_id}::uuid,
            outlier_flags = COALESCE(
              (SELECT jsonb_agg(elem) FROM jsonb_array_elements(outlier_flags) elem
               WHERE elem <> '"lineage_missing"'::jsonb),
              '[]'::jsonb
            )
        WHERE source = 'migration_v10'
          AND agent_event_id = ${ZERO_UUID}::uuid
          AND institution_id = ${institution_id}
      `;
      totalUpdated += updated.count;
    });
    if (eventsCreated % 200 === 0) console.log(`  progress: ${eventsCreated}/${stranded.length} institutions, ${totalUpdated} rows relinked`);
  }

  console.log(`\nDone. Events created: ${eventsCreated}. fees_raw rows relinked: ${totalUpdated}.`);

  // Verify
  const after = await sql`
    SELECT COUNT(*)::int AS n FROM fees_raw
    WHERE source = 'migration_v10' AND agent_event_id = ${ZERO_UUID}::uuid
  `;
  console.log(`Remaining stranded rows: ${after[0].n} (should be 0)`);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
}).finally(() => sql.end());
