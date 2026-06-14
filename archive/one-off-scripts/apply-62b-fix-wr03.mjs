import fs from 'fs';
import postgres from 'postgres';
import { config } from 'dotenv';
config();
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
try {
  await sql.unsafe(
    fs.readFileSync(
      'supabase/migrations/20260515_agent_events_status_in_progress.sql',
      'utf8',
    ),
  );
  console.log('OK  20260515_agent_events_status_in_progress.sql');
  // Verify the check constraint now accepts in_progress.
  const r = await sql`
    SELECT pg_get_constraintdef(oid) AS def
      FROM pg_constraint
     WHERE conname = 'agent_events_status_check'
  `;
  console.log('agent_events_status_check:', r[0]?.def ?? '(missing)');
} catch (err) {
  console.error('FAIL:', err.message);
  process.exitCode = 1;
}
await sql.end();
