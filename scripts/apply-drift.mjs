import postgres from "postgres";
import { readFile } from "node:fs/promises";
import "dotenv/config";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const migration = await readFile("/tmp/20261231_reconcile_schema_drift.sql", "utf8");
await sql.unsafe(migration);
const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='classification_cache' ORDER BY ordinal_position`;
console.log("classification_cache cols:", cols.map(r => r.column_name));
await sql.end();
