# Phase 14 production release evidence

## Current decision

**NO-GO — NOT VERIFIED**

This is a blank evidence template, not proof of readiness. Copy it for a specific immutable release and replace each `NOT VERIFIED` only after a named reviewer links concrete evidence. The machine-readable authority is a release JSON based on `scripts/release/release-evidence.no-go.json`; the validator must return `GO` for the exact deployed SHA.

## Release identity

| Field                                       | Value        |
| ------------------------------------------- | ------------ |
| Release ID                                  | NOT VERIFIED |
| Application version                         | NOT VERIFIED |
| Git commit SHA                              | NOT VERIFIED |
| API/worker image digest                     | NOT VERIFIED |
| Web deployment ID                           | NOT VERIFIED |
| Mobile/EAS build ID and Android versionCode | NOT VERIFIED |
| Migration set/checksum                      | NOT VERIFIED |
| Production configuration version            | NOT VERIFIED |
| Change window (UTC)                         | NOT VERIFIED |
| Release commander                           | NOT VERIFIED |
| Evidence owner                              | NOT VERIFIED |

Any artifact/configuration change after evidence collection creates a new candidate and resets affected gates to `NOT_VERIFIED`.

## Gate register

| Validator gate                 | Default      | Waiver        | Concrete evidence required                                                               |
| ------------------------------ | ------------ | ------------- | ---------------------------------------------------------------------------------------- |
| `source_revision`              | NOT VERIFIED | No            | Clean immutable SHA/tag and artifact/digest provenance                                   |
| `phase_dependency_consistency` | NOT VERIFIED | No            | P1 -> P2 -> P3 review across schema, API, worker, web, mobile, providers                 |
| `quality_gates`                | NOT VERIFIED | No            | Install, format, DB check, lint, type, unit, integration, production builds from SHA     |
| `dependency_scan`              | NOT VERIFIED | No            | Production dependency report with no critical/high open findings                         |
| `container_scan`               | NOT VERIFIED | No            | Scan of exact API/worker image digest                                                    |
| `tenant_authorization`         | NOT VERIFIED | No            | Tenant/branch/team/assignment/permission/support-access test and audit report            |
| `critical_high_security`       | NOT VERIFIED | No            | Security review and resolved critical/high finding register                              |
| `migration_compatibility`      | NOT VERIFIED | No            | Additive migration ledger, lock/runtime evidence, old/new compatibility, reviewer        |
| `backup_snapshot`              | NOT VERIFIED | No            | Provider backup ID, logical dump hash, Tigris inventory/checksums, RPO basis             |
| `isolated_restore_drill`       | NOT VERIFIED | No            | Isolated project IDs, operation/log artifacts, invariant checks, measured RPO/RTO        |
| `rollback_plan`                | NOT VERIFIED | No            | Revision-specific app/config/queue/data decision plan and rehearsal/review               |
| `load_test`                    | NOT VERIFIED | No            | JSON result: 75 concurrency, representative staging traffic, p95/error/sample PASS       |
| `soak_test`                    | NOT VERIFIED | Allowed       | JSON result and resource/queue/provider stability, or valid scoped waiver                |
| `observability_alerts`         | NOT VERIFIED | No            | Dashboard/monitor IDs, Sentry release, alert routing synthetic test                      |
| `provider_readiness`           | NOT VERIFIED | Allowed / N/A | Provider approvals/callback/signature/idempotency/rate tests; or disabled flags evidence |
| `ai_social_human_approval`     | NOT VERIFIED | Allowed / N/A | Provider-backed human approval evidence; or disabled flags evidence                      |
| `mobile_release`               | NOT VERIFIED | No            | Signed artifact identity, permissions/privacy, revocation/offline/location, staged pilot |
| `critical_journey`             | NOT VERIFIED | No            | Lead-to-reminder evidence with audit/history/queue/provider handoffs and denial tests    |
| `pilot_acceptance`             | NOT VERIFIED | Allowed       | Signed one-dealership acceptance and metrics; or valid scoped waiver                     |
| `release_signoff`              | NOT VERIFIED | No            | Named product, engineering, operations, security signoff for exact revision              |

An unavailable tool, absent real environment, unconfigured provider, unexecuted test, or unsigned checklist is `NOT_VERIFIED`, never `VERIFIED`.

## Evidence JSON rules

Start outside the source tree so incomplete release records are not mistaken for repository facts:

```powershell
Copy-Item .\scripts\release\release-evidence.no-go.json C:\secure-release-evidence\release.json
```

A verified gate uses concrete identities and immutable artifact references:

```json
{
  "status": "VERIFIED",
  "verifiedBy": "Named reviewer and role",
  "verifiedAt": "2026-08-09T12:00:00.000Z",
  "evidence": ["ci-run://123456", "artifact://release-id/security-report-sha256"]
}
```

`NOT_APPLICABLE` is accepted only for `provider_readiness` and `ai_social_human_approval`, and only when concrete feature-flag/configuration evidence proves every such production capability is disabled:

```json
{
  "status": "NOT_APPLICABLE",
  "approvedBy": "Named product and security reviewers",
  "approvedAt": "2026-08-09T12:00:00.000Z",
  "rationale": "Every official provider feature flag is disabled for this release.",
  "evidence": ["artifact://release-id/redacted-feature-flag-export"]
}
```

Only validator-designated gates may be waived. A waiver requires evidence plus named approver, meaningful rationale, approval time, and a future expiry:

```json
{
  "status": "WAIVED",
  "evidence": ["ticket://RISK-1234"],
  "waiver": {
    "approvedBy": "Named accountable owner",
    "rationale": "Specific bounded risk, scope, compensating control, and remediation owner/date.",
    "approvedAt": "2026-08-09T12:00:00.000Z",
    "expiresAt": "2026-08-16T12:00:00.000Z"
  }
}
```

Placeholder paths, `TODO`, `TBD`, screenshots without environment/time/query identity, or mutable branch links are not evidence.

## Validation record

Run:

```powershell
node scripts/release/validate-release-evidence.mjs C:\secure-release-evidence\release.json --output C:\secure-release-evidence\validation.json
```

| Field                              | Value                |
| ---------------------------------- | -------------------- |
| Validator command/run ID           | NOT VERIFIED         |
| Validator result                   | NO-GO / NOT VERIFIED |
| Output SHA-256                     | NOT VERIFIED         |
| Independent reviewer               | NOT VERIFIED         |
| Reviewed UTC time                  | NOT VERIFIED         |
| Evidence retention/access location | NOT VERIFIED         |

Exit code `0` and JSON decision `GO` are required. They do not replace change authority or human review; confirm the evidence SHA/digests exactly match production.

## Required final signoff

| Authority               | Named approver | Decision     | UTC time     | Evidence/signature reference |
| ----------------------- | -------------- | ------------ | ------------ | ---------------------------- |
| Product                 | NOT VERIFIED   | NOT APPROVED | NOT VERIFIED | NOT VERIFIED                 |
| Engineering             | NOT VERIFIED   | NOT APPROVED | NOT VERIFIED | NOT VERIFIED                 |
| Operations              | NOT VERIFIED   | NOT APPROVED | NOT VERIFIED | NOT VERIFIED                 |
| Security                | NOT VERIFIED   | NOT APPROVED | NOT VERIFIED | NOT VERIFIED                 |
| Pilot dealership/client | NOT VERIFIED   | NOT APPROVED | NOT VERIFIED | NOT VERIFIED                 |
| Release commander       | NOT VERIFIED   | NO-GO        | NOT VERIFIED | NOT VERIFIED                 |

Until all non-waivable gates pass, allowed exceptions are valid, and required signatures bind to the same release identity, the decision remains **NO-GO**.
