#!/usr/bin/env node
/**
 * Data validation report for Bank Fee Index.
 * Usage: DATABASE_URL=... node scripts/validate-data.js
 */
const postgres = require('postgres');
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL required'); process.exit(1); }
const sql = postgres(DATABASE_URL, { ssl: 'require' });

(async () => {
  console.log('=== BANK FEE INDEX — DATA VALIDATION ===');
  console.log('Date:', new Date().toISOString());
  console.log('');

  const [funnel] = await sql`
    SELECT COUNT(*) as total, COUNT(website_url) as has_website,
      COUNT(fee_schedule_url) as has_fee_url,
      (SELECT COUNT(DISTINCT crawl_target_id) FROM extracted_fees) as with_fees,
      (SELECT COUNT(DISTINCT crawl_target_id) FROM extracted_fees WHERE review_status = 'approved') as with_approved
    FROM crawl_targets`;
  console.log('Coverage Funnel:');
  console.log('  Total institutions:  ' + Number(funnel.total).toLocaleString());
  console.log('  Has website URL:     ' + Number(funnel.has_website).toLocaleString() + ' (' + (100*funnel.has_website/funnel.total).toFixed(1) + '%)');
  console.log('  Has fee URL:         ' + Number(funnel.has_fee_url).toLocaleString() + ' (' + (100*funnel.has_fee_url/funnel.total).toFixed(1) + '%)');
  console.log('  With extracted fees: ' + Number(funnel.with_fees).toLocaleString() + ' (' + (100*funnel.with_fees/funnel.total).toFixed(1) + '%)');
  console.log('  With approved fees:  ' + Number(funnel.with_approved).toLocaleString() + ' (' + (100*funnel.with_approved/funnel.total).toFixed(1) + '%)');
  console.log('');

  const statuses = await sql`SELECT review_status, COUNT(*) as n FROM extracted_fees GROUP BY review_status ORDER BY n DESC`;
  console.log('Fee Review Status:');
  statuses.forEach(s => console.log('  ' + (s.review_status||'null').padEnd(12) + Number(s.n).toLocaleString()));
  console.log('');

  const tables = ['crawl_targets','extracted_fees','fee_reviews','fee_snapshots','fee_change_events',
    'crawl_runs','crawl_results','users','leads','institution_financials','institution_complaints',
    'branch_deposits','census_tracts','fed_economic_indicators','demographics','fed_beige_book',
    'fed_content','jobs','platform_registry','fee_alert_subscriptions','analysis_results',
    'discovery_cache','ops_jobs','pipeline_runs','coverage_snapshots','fee_index_cache'];
  console.log('Table Inventory:');
  for (const t of tables) {
    try { const [r] = await sql.unsafe('SELECT COUNT(*) as n FROM '+t); console.log('  '+t.padEnd(28)+Number(r.n).toLocaleString().padStart(10)); } catch { console.log('  '+t.padEnd(28)+'     ERROR'); }
  }
  console.log('');

  const [o1] = await sql`SELECT COUNT(*) as n FROM extracted_fees ef WHERE NOT EXISTS (SELECT 1 FROM crawl_targets ct WHERE ct.id = ef.crawl_target_id)`;
  const [o2] = await sql`SELECT COUNT(*) as n FROM fee_reviews fr WHERE NOT EXISTS (SELECT 1 FROM extracted_fees ef WHERE ef.id = fr.fee_id)`;
  console.log('FK Integrity:');
  console.log('  Orphaned extracted_fees: ' + o1.n + (Number(o1.n)===0?' PASS':' FAIL'));
  console.log('  Orphaned fee_reviews:    ' + o2.n + (Number(o2.n)===0?' PASS':' FAIL'));
  console.log('');

  const queue = await sql`SELECT queue, status, COUNT(*) as n FROM jobs GROUP BY queue, status ORDER BY queue, n DESC`;
  console.log('Job Queue:');
  queue.forEach(q => console.log('  ' + q.queue.padEnd(12) + q.status.padEnd(12) + Number(q.n).toLocaleString()));
  console.log('');

  const states = await sql`
    SELECT ct.state_code, COUNT(*) as total,
      COUNT(DISTINCT ef.crawl_target_id) as with_fees,
      ROUND(100.0 * COUNT(DISTINCT ef.crawl_target_id) / NULLIF(COUNT(*),0), 1) as pct
    FROM crawl_targets ct
    LEFT JOIN extracted_fees ef ON ef.crawl_target_id = ct.id AND ef.review_status != 'rejected'
    WHERE ct.state_code IS NOT NULL
    GROUP BY ct.state_code ORDER BY pct DESC LIMIT 10`;
  console.log('Top 10 States by Coverage:');
  states.forEach(s => console.log('  '+s.state_code+': '+s.with_fees+'/'+s.total+' ('+s.pct+'%)'));

  console.log('');
  const [snap] = await sql`SELECT COUNT(*) as n, COUNT(DISTINCT snapshot_date) as dates FROM fee_snapshots`;
  console.log('Time Series: ' + Number(snap.n).toLocaleString() + ' snapshots across ' + snap.dates + ' dates');
  console.log('');
  console.log('=== VALIDATION COMPLETE ===');
  await sql.end();
})();
