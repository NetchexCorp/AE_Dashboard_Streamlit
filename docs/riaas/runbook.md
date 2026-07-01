# RIaaS deploy runbook — revision promotion (spec §11)

RIaaS ships inside the existing backend + frontend images. No new infrastructure:
no Bicep changes, no new Entra app, no new Storage account. The `Ri*` tables are
created at app startup by `storage/migrations.ensure_tables()`.

## Settings (new since RIaaS)

| Env var | Prod (promoted) | Pre-promotion revision |
|---|---|---|
| `FEATURE_RIAAS_ALLOWED_EMAILS` | `pmankar@netchexonline.com` | same |
| `SCHEDULER_ENABLED` | `true` | **`false`** — no cron fires from a 0%-traffic revision |
| `SENDGRID_SANDBOX_MODE` | `false` | **`true`** |
| `SENDGRID_RECIPIENT_OVERRIDE` | (empty) | a safe test inbox |
| `ALLOW_PROD_QUERY_WRITES` | `false` (flip only when editing templates) | `false` |

## Promotion steps

1. **Build once.** Build backend + frontend images tagged `:<git-sha>` (never
   `:latest`), push to the existing ACR, capture each `@sha256:<digest>`.
2. **Deploy a new revision at 0% traffic** (multiple-revision mode) with label
   `riaas-next`, using the digests and the pre-promotion env values above.
3. **Smoke-test the label FQDN:**
   - Easy Auth login as the allow-listed user → Organization Performance group
     visible; `/api/me` → `features.riaas: true`.
   - Log in as a non-flagged user → no nav group; `GET /api/riaas/chapters` → 404;
     no `OrgPerformanceRoute`/`ChapterRoute` JS chunks downloaded.
   - Open `/org/chapters/gtm-overview` → six analyses render live data.
   - `GET /api/riaas/report/preview` renders all five chapters.
   - Send-once a report (sandbox mode) → SendGrid 200, no delivery.
   - Individual Performance tabs unchanged (spot-check All Source Summary).
4. **Promote:** shift traffic `riaas-next` → 100%. The feature flag keeps the
   surface dark for everyone but the allowlist.
5. **Post-promotion:** set `SCHEDULER_ENABLED=true`, clear sandbox/override on
   the promoted revision only.
6. **Rollback:** shift traffic back to the previous revision. Never rebuild.

## Deployment record (2026-07-02)

- Registry `acrx6by53mpm6lgu`; images `ae-dashboard-api:6733970`,
  `ae-dashboard-ui:6a45acc` (pull by **tag** — the apps' registry auth rejects
  `@sha256:` digest pulls with ImagePullFailure).
- **API promoted**: `aedash-api--riaas-live` at 100% (RIaaS code,
  `FEATURE_RIAAS_ALLOWED_EMAILS=pmankar@netchexonline.com`,
  `SCHEDULER_ENABLED=true`, sandbox off). Old `aedash-api--0000029` deactivated.
  Interim `--riaas-next2` (scheduler off) staged/promoted/retired so two
  schedulers never ran simultaneously.
- **UI staged**: `aedash-ui--riaas-ux1` Healthy at 0% traffic (supersedes
  `riaas-next2`/`riaas-next3`, both retired; adds nav grouping + chapter UX);
  `aedash-ui--0000025` still serves 100%.
- **Stable staging URL** (register its auth callback in Entra **once**):
  `https://aedash-ui---staging.bravestone-4e7fe75c.eastus.azurecontainerapps.io`
  — the `staging` revision **label**. Revisions are immutable, so per-revision
  FQDNs churn on every deploy; the label URL doesn't. Point it at any future
  staged revision with:
  `az containerapp revision label add -n aedash-ui -g doldata-rg --label staging --revision <rev> --no-prompt`
- **Promote** after browser smoke test:
  `az containerapp ingress traffic set -n aedash-ui -g doldata-rg --revision-weight aedash-ui--riaas-ux1=100`
- **Rollback**: shift traffic back
  (`... --revision-weight aedash-ui--0000025=100`); API rollback would need the
  old image revision reactivated (`az containerapp revision activate ... --revision aedash-api--0000029`).

## Log filtering

RIaaS logs come from the `app.analysis.*` and `app.services.riaas.*` loggers,
plus audit rows with `Entity eq 'riaas'` — filter either in the shared Log
Analytics workspace. Every template edit, schedule change, report send, and
first feature access writes an audit row.

## Template overrides

Runtime SOQL overrides live in the `RiAnalyses` table (history in
`RiAnalysesHistory`), guarded by `ALLOW_PROD_QUERY_WRITES`. Mirror to git with
`python scripts/sync_analyses.py --export` → `analyses_snapshot.json`
(`--check` in CI, `--import` for disaster recovery).
