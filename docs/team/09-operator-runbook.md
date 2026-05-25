# Operator Runbook — Getting to "Live"

Founder report says it best: *"i dont have any access right now. and nothing is 'live'"*. This doc fixes both.

There are three things to solve:

1. **Reach the admin UI** (you can't see `localhost:8000` from your laptop because it's inside an ephemeral Claude Code container).
2. **Connect the UI to a real DB** (Supabase prod, where the 8,750 institutions + 103K fees live).
3. **Connect the UI to a real agent runtime** (Modal, where the crons actually fire).

The new `/admin/command` page is the single pane that proves each of these is wired correctly.

---

## Path A — Run it on your laptop (fastest, ≈10 min)

Best for: verifying everything works without paying for hosting yet.

```bash
# 1. Clone + install
git clone https://github.com/Gilmore3088/feeschedule-hub.git
cd feeschedule-hub
git checkout claude/peaceful-ride-EK68V
npm install
pip install -r fee_crawler/requirements.txt

# 2. Set env in .env.local — at minimum:
#    DATABASE_URL=postgres://...your prod Supabase session-pooler URL...
#    BFI_ADMIN_PASSWORD=<choose one>
#    BFI_ANALYST_PASSWORD=<choose one>
#    BFI_COOKIE_SECRET=$(openssl rand -hex 32)
#    ANTHROPIC_API_KEY=sk-ant-...     # only needed if you'll run Hamilton
#    BFI_MODAL_WORKERS_BASE_URL=https://<your-modal-app-id>.modal.run
#                                       # only needed for the "Modal-triggered" buttons

# 3. Seed admin user (one-off)
npm run db:seed

# 4. Boot
npm run dev

# 5. Open
open http://localhost:3000/admin/command
# Log in as admin / $BFI_ADMIN_PASSWORD
```

**What you'll see:**
- 🟡 amber "Setup in progress" banner if no cron has run yet
- The 5-tile data pipeline strip — `fees_raw` should show ~103K against your prod DB
- The agent board — should list 6 specialized agents + 51 state agents (or a subset)
- Recent agent_events, recent lessons, operator checklist
- **Live actions** section — buttons that actually trigger work, scoped to admin auth

**What works without Modal:**
- Every read panel (tiers, agents, events, lessons, coverage)
- The five "Local" buttons (stats, test-connection, dispatcher tick, discovery sweep, backfill dry-run)
- All the copy-paste commands

**What requires Modal:**
- The "Run Atlas for one state" + "Bulk extraction" buttons (they POST to a Modal HTTP endpoint)
- Without `BFI_MODAL_WORKERS_BASE_URL` set, these buttons return a clear error telling you which env var to set.

---

## Path B — Deploy to Vercel (≈20 min, gives you a public URL)

Best for: you want to use this from anywhere, share access with the team.

```bash
# Prerequisites: Vercel account, Vercel CLI installed
npm i -g vercel

# 1. Login + link
vercel login
vercel link

# 2. Set production env vars (same list as Path A step 2)
vercel env add DATABASE_URL production
vercel env add BFI_COOKIE_SECRET production
vercel env add BFI_ADMIN_PASSWORD production
vercel env add BFI_ANALYST_PASSWORD production
vercel env add ANTHROPIC_API_KEY production
vercel env add BFI_MODAL_WORKERS_BASE_URL production

# 3. Push to main, Vercel auto-deploys
git push origin claude/peaceful-ride-EK68V

# 4. Visit
open https://<your-app>.vercel.app/admin/command
```

**Note on Live actions on Vercel:** the "Local" buttons (subprocess-based) won't work on Vercel because Vercel functions can't spawn `python -m fee_crawler`. They'll either timeout or hit serverless limits. The "Modal-triggered" buttons will work fine because they're HTTP POSTs.

For Vercel-only deploys, plan to run the local commands from your laptop (Path A) and the Modal commands from the deployed UI.

---

## Path C — Deploy Modal (≈15 min, makes the agents actually run)

This is what makes "live" actually mean live. The Next.js UI without Modal is read-only against a static snapshot of data. With Modal, the agents fire every minute.

```bash
# 1. Install + auth Modal
pip install modal
modal token new

# 2. Create the bfi-secrets Modal Secret (one-time)
modal secret create bfi-secrets \
  --env DATABASE_URL="postgres://..." \
  --env R2_ENDPOINT="https://...r2.cloudflarestorage.com" \
  --env R2_ACCESS_KEY_ID="..." \
  --env R2_SECRET_ACCESS_KEY="..." \
  --env R2_BUCKET="..." \
  --env ANTHROPIC_API_KEY="sk-ant-..." \
  --env FRED_API_KEY="..." \
  --env BFI_APP_URL="https://your-vercel-app.vercel.app" \
  --env REPORT_INTERNAL_SECRET="$(openssl rand -hex 32)" \
  --env REPORT_CRON_SECRET="$(openssl rand -hex 32)" \
  --env DARWIN_DAILY_COST_LIMIT_USD=30
#                                  ^^^^ this is the one knob that
#                                  unlocks the Darwin backlog drain

# 3. Deploy
bash scripts/modal-deploy.sh
# Validates env, applies pending migrations, deploys both apps,
# prints the endpoint URLs.

# 4. Get the base URL for the UI
modal url bank-fee-index-workers atlas_dispatch
# → https://<your-app-id>--bank-fee-index-workers-atlas-dispatch.modal.run
# The common prefix is your BFI_MODAL_WORKERS_BASE_URL.

# 5. Verify cron is firing — wait 60 seconds, then:
psql "$DATABASE_URL" -c "
  SELECT job_name, completed_at, status,
         ROUND(EXTRACT(EPOCH FROM (NOW() - completed_at))/60.0, 1) AS min_ago
    FROM workers_last_run
   ORDER BY completed_at DESC NULLS LAST LIMIT 10;
"
# Expect at least one row from the last minute.
```

After this:
- `/admin/command` will show 🟢 "Pipeline live"
- The pipeline tile counts will start climbing as Darwin drains
- Agent budgets will start showing real spend
- The Recent events table will fill with `success` rows

---

## What "live" actually looks like

When everything's connected, the command center shows:

| Marker | What it means |
|---|---|
| 🟢 banner at top | Every cron in EXPECTED_JOBS ran within its window |
| Agent board: events_24h > 0 for at least 5 rows | Pipeline is touching multiple agents |
| Agent board: per_day_spent > 0 for darwin + magellan | Real LLM calls happening |
| Recent agent_events: mostly status=success | No silent failures |
| Recent lessons: 7 rows, one per agent rotation | LOOP-04→07 is running |
| Tier 2 promotion % above 50% (was 1.3%) | Backlog draining |

---

## Common questions

**"Can the Live action buttons accidentally blow up my Anthropic bill?"**
No. Three layers of protection:
1. Server action requires `admin` role (`requireAuth("admin")`).
2. Every command is in an allowlist — arbitrary commands rejected.
3. Every agent has a `per_day` budget cap. Gateway raises `BudgetExceeded` after the cap. Worst case is one extra day's worth of spend (~$30 total fleet).

**"Why aren't the buttons RUNNING ACTIONS visible without admin login?"**
The `requireAuth("admin")` gate in `actions.ts`. If you log in as analyst, the page renders but buttons error with "Forbidden."

**"What if I want the agents to keep running but pause Hamilton?"**
Set `is_active=false` on Hamilton's row in `agent_registry`. The gateway will reject Hamilton's writes; the rest of the fleet keeps running.

**"How do I roll back if the pipeline misbehaves?"**
Two layers:
1. `python -m fee_crawler rollback-publish --batch-id <id>` — soft-deletes a publish batch by setting `rolled_back_at`.
2. `UPDATE agent_registry SET is_active=false WHERE agent_name='<name>'` — silences a single agent without redeploy.

---

## What you should do RIGHT NOW

In order:

1. **Pick Path A or Path B** to get the UI in front of your eyes.
2. **Apply the pending migrations** (`node scripts/apply-migration.mjs --dry-run` then `--pending`).
3. **Look at `/admin/command`.** Even with no Modal deploy yet, the data tiles should show your real 103K `fees_raw` and 1,347 `fees_verified`.
4. **Deploy Modal (Path C) with `DARWIN_DAILY_COST_LIMIT_USD=30`.** Within an hour the dispatch tick will start firing every minute and the Tier 2 promotion rate will start climbing.
5. **Come back to `/admin/command` in 24 hours.** It should be entirely 🟢, with the backlog ~10% drained.

The team has built the controls. You're one Modal deploy away from "live."
