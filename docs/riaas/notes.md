# RIaaS build log

One lesson per entry, newest first. Update entries instead of duplicating.

## Repo/branch reality differs from spec

The spec names branch `overhaul/v2`; that branch does not exist. `main` *is* the
FastAPI + React app the spec describes. Work happens on `feat/riaas-org-performance`
off `main`.

## Pre-existing test failure (not RIaaS)

`tests/test_soql_endpoints.py::test_get_known_col_id_returns_entry` fails on a clean
checkout (`has_override is True`) — a local `soql_overrides.json` dev artifact causes
it. Not caused by and not fixed by RIaaS work.

## Feature flag (Phase 1) — decisions

- `require_riaas_access` returns **404** for non-allowlisted users; `ENV=dev` bypasses
  the allowlist entirely (matches spec "dev bypass still applies"), so local dev always
  sees Organization Performance. Test the off-state with `ENV=prod` like
  `test_riaas_access.py` does.
- First-access audit (`entity="riaas", action="access_granted"`) is deduped with a
  process-lifetime in-memory set — one event per user per process, not per lifetime.
  Good enough for launch; revisit if exact once-ever semantics matter.
- `/api/me` now returns `features: { riaas: bool }`; frontend nav gates on it and the
  `/org` route bundle is lazy (verified: own chunk `OrgPerformanceRoute.lazy-*.js` in
  `npm run build` output).

## Open org-specific values (§14)

- Fiscal calendar, stage names, territory model, ICP tier thresholds — all unconfirmed.
  Confirm during Chapter 1 (Phase 3) via live SOQL/describe.
- Salesforce credentials: `.env` exists at repo root — check whether SF_CLIENT_ID/SECRET
  are populated before attempting live field confirmation.
