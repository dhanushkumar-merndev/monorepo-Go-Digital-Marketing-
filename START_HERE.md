# START HERE — Go Digital Automobile CRM

This package is intended to be extracted into the **root of a new project folder**.

## Included files

- `Go_Digital_Automobile_CRM_10_on_10_Final_Technical_PRD_v4_0.docx`
- `AGENTS.md`
- `PROMPTS/00_PHASE_FOUNDATION.md` through `PROMPTS/14_PRODUCTION_RELEASE.md`
- `PROMPTS/99_PHASE_COMPLETION_AUDIT.md`

## Recommended workflow

1. Create one empty project folder.
2. Extract this ZIP directly into that folder.
3. Open the **root folder** in your IDE/Chat Ultra.
4. Do **not** run `create-next-app` at the root. The product is a monorepo, not a standalone Next.js project.
5. Paste the content of `PROMPTS/00_PHASE_FOUNDATION.md` into Chat Ultra.
6. Let Phase 0 create `apps/web`, `apps/api`, `apps/mobile`, shared packages, workspace configuration and implementation tracking documents.
7. After Phase 0 finishes, paste `PROMPTS/99_PHASE_COMPLETION_AUDIT.md`.
8. Only after the audit passes, paste `PROMPTS/01_AUTH_TENANCY.md`.
9. Continue one phase at a time, always running the audit prompt after each phase.

## About node_modules

The repository uses a pnpm workspace. Run dependency installation from the root. pnpm maintains a shared content-addressed store and workspace links, so you should not create separate npm installations in every app. Never put `node_modules` inside this ZIP or commit it to Git.

## If you want to scaffold manually

The safest option is still to let Phase 0 scaffold the monorepo.

If you already created a Next.js application, keep it and tell Chat Ultra to migrate it into `apps/web`. Do not leave a standalone Next.js app at the monorepo root unless the Phase 0 architecture deliberately restructures it.

## Files created automatically during Phase 0

Chat Ultra must create these if they do not exist:

- `docs/implementation/PHASE_STATUS.md`
- `docs/implementation/DECISIONS.md`
- `docs/implementation/KNOWN_ISSUES.md`
- `docs/implementation/NEXT_PHASE_HANDOFF.md`

You do not need to prepare them manually.
