# Admin E2E smoke tests (Playwright)

On-demand smoke tests against a **deployed** Bank Fee Index admin UI. They log
in as a real admin and drive the agentic data pipeline. They are **not** run in
CI — they hit the live deploy + real Modal + real Supabase and write to the DB.

## Run

```bash
# Required: a real active admin account's password in the target DB.
export BFI_E2E_PASSWORD='…'

# Optional overrides:
export BFI_E2E_URL='https://bankfeeindex.com'   # default
export BFI_E2E_USERNAME='admin'                 # default
export BFI_E2E_STATE='VT'                        # default (bounded)
export BFI_E2E_ATLAS_SIZE='2'                    # default

npm run test:e2e
```

## What it does

`admin-agentic-pipeline.spec.ts`: logs in → `/admin/command` → "Run Atlas for
one state" (small state + size) → asserts the trigger resolves to `✓ ok`. A
fee-count delta is logged as a soft signal, not a pass/fail (a real run may find
0 new fees, and Modal work lands asynchronously).

## A red result may be correct

The test deliberately surfaces real production breaks at the trigger step:
- `requireAuth("admin")` — `"admin"` is a role, not a `Permission`, so it may
  deny the Command Center action for everyone.
- `BFI_MODAL_WORKERS_BASE_URL` unset on the deploy.

If either is live, the test fails with the result-pane text quoted.
