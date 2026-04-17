import fs from 'fs';
import postgres from 'postgres';
import { config } from 'dotenv';
config();
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
try {
  await sql.unsafe(
    fs.readFileSync(
      'supabase/migrations/20260516_workers_last_run.sql',
      'utf8',
    ),
  );
  console.log('OK  20260516_workers_last_run.sql');
  const r = await sql`
    SELECT column_name, data_type
      FROM information_schema.columns
     WHERE table_name = 'workers_last_run'
     ORDER BY ordinal_position
  `;
  console.log('workers_last_run columns:', r.map((c) => `${c.column_name}:${c.data_type}`).join(', '));
} catch (err) {
  console.error('FAIL:', err.message);
  process.exitCode = 1;
}
await sql.end();
