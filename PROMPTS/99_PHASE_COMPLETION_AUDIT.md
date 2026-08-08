# STRICT PHASE COMPLETION AUDIT

Do not begin the next phase.

Inspect the actual repository and perform a strict completion audit for the phase that was just implemented.

1. Compare the implementation with every acceptance criterion in the phase prompt.
2. Do not rely on the previous response; inspect source files, migrations, configuration and tests.
3. Run formatting checks.
4. Run linting.
5. Run TypeScript checks.
6. Run unit tests.
7. Run integration tests.
8. Run production builds for all affected apps/packages.
9. Inspect authorization and tenant isolation.
10. Inspect migrations and data integrity.
    - For recovery/backfill migrations, verify existing-row compatibility, explicit ambiguity
      handling, preservation of IDs/history and cross-phase foreign-key consistency.
11. Identify incomplete, mocked, hardcoded, insecure or non-functional work.
12. Fix issues that belong to the current phase.
    - Re-run the earlier phase audit before auditing a dependent later phase.
13. Do not implement future-phase features.
14. Update:
    - `docs/implementation/PHASE_STATUS.md`
    - `docs/implementation/DECISIONS.md`
    - `docs/implementation/KNOWN_ISSUES.md`
    - `docs/implementation/NEXT_PHASE_HANDOFF.md`

For a Phase 4 manual-recording change, additionally verify the recording source/provenance, active
consent, tenant and assignment scope for upload/listen/download, private storage metadata validation,
idempotent upload initiation/completion, activity/audit/outbox evidence, retention fields and the
absence of restricted Android permissions. Do not mark a browser MIME declaration alone as malware or
media-content scanning.

## Client State Audit

1. Inventory every Zustand store and name its single feature/workflow owner.
2. Confirm TanStack Query/API remains authoritative for server records and status.
3. Confirm URL state owns shareable/deep-linkable filters, tabs, selections and identifiers.
4. Confirm isolated component state remains local.
5. Confirm durable mobile offline commands and replay remain in SQLite/outbox storage.
6. Reject duplicated server collections or records held as authoritative Zustand state.
7. Reject access tokens, refresh tokens, provider credentials, secrets and OAuth codes in stores.
8. Reject customer PII, message bodies, documents, signed URLs and location history in persisted stores.
9. Confirm persistence is disabled by default and every exception is documented, minimal and encrypted
   where the platform supports it.
10. Confirm logout clears all stores.
11. Confirm account, membership and tenant switches clear all stores before new data is rendered.
12. Confirm support-elevation start/end clears all stores.
13. Confirm disabled/suspended/session-revoked paths clear all stores.
14. Confirm selector-based subscriptions avoid broad render coupling.
15. Review SSR/hydration and devtools exposure for web stores.
16. Test stale-context prevention and store reset behavior on web and mobile.

## Unified Inbox Audit

1. Confirm one channel-neutral inbox and canonical Conversation/Message model is used.
2. Confirm Phase 5 enables official WhatsApp Business Platform only and contains no personal QR,
   WhatsApp Web scraping or unofficial automation.
3. Confirm future Instagram Direct and Facebook Messenger work extends the same inbox foundation.
4. Confirm Contact/Lead context, Conversation Owner, tenant scope and timeline semantics are shared.
5. Confirm provider credentials, identifiers, webhooks, templates, policy windows and media references
   remain behind provider boundaries.
6. Confirm duplicate webhooks, concurrent retries and provider/local ordering are deterministic and safe.

7. Report:
   - Completed requirements
   - Partially completed requirements
   - Failed requirements
   - Test results
   - Build results
   - Database migrations
   - Environment-variable changes
   - Known risks
   - Exact next-phase prerequisites

Do not say "complete" unless mandatory tests and affected production builds pass.
