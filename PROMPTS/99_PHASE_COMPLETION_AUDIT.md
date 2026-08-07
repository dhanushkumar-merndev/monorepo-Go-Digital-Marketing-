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
15. Report:
    - Completed requirements
    - Partially completed requirements
    - Failed requirements
    - Test results
    - Build results
    - Database migrations
    - Environment-variable changes
    - Known risks
    - Exact next-phase prerequisites

Do not say “complete” unless mandatory tests and affected production builds pass.
