# Phase Status

- **Current phase:** Phase 5 — Unified Inbox and WhatsApp platform foundation.
- **Current status:** **Phase 5 code complete; external validation remains.**
- **Completed phases:** Phase 0 foundation, Phase 1 authentication/tenancy, Phase 2 organization
  recovery, Phase 3 Lead CRM, Phase 4 telephony, Phase 5 unified messaging (local code and automated
  validation).
- **Next phase:** Phase 6 — Test Rides. Preserve Phase 5 records and do not activate a live provider
  until the prerequisites below are supplied.
- **Last updated:** 2026-08-08

## Phase 5 acceptance-criterion checklist

- [x] Conversations, participants, messages, media, templates, status history, assignments,
      connections, webhook receipts, outbound outbox, opt-ins and suppressions are tenant-owned and
      protected by composite tenant foreign keys and backend scope checks.
- [x] Free-form sends are backend-blocked outside the configured customer-service window; templates
      must be provider-approved and have a current category opt-in. Active all/marketing
      suppressions are enforced server-side.
- [x] Signed provider events are durably accepted before BullMQ processing. The PostgreSQL receipt
      remains recoverable if Redis is unavailable; failed receipts can be reconciled and are moved
      to dead letter after the configured attempts.
- [x] Tenant/provider/external-event and tenant/provider-message uniqueness prevent duplicate
      webhooks from creating duplicate messages. Outbound retries reuse the same message/outbox
      record, and conflicting reuse of an idempotency key is rejected by request fingerprint.
- [x] `conversation_owner_id` remains independent from relationship and current-process ownership.
      Assignment changes only the conversation owner and append-only assignment history.
- [x] Timeline ordering is deterministic by provider occurrence, provider sequence, local receipt and
      UUID tie-breaker; Message status history remains append-only.
- [x] Official WhatsApp Cloud boundaries support encrypted tenant access token/app secret/verify
      token, WABA and phone-number IDs, one callback path for verification/events, explicit health
      activation, template synchronization, quality/limit placeholders and embedded-onboarding state.
- [x] An unknown Click-to-WhatsApp sender creates a canonical provider Lead only on the first signed
      inbound message carrying verified referral evidence. Unknown non-referral senders fail closed.
- [x] Web provides a responsive inbox/list/detail/customer panel, internal notes, free-form/template
      composer, private media upload, owner/queue assignment, connection status/activation, template
      catalogue and failure recovery with loading, empty, error, disabled and success states.
- [x] Mobile provides assigned conversations, deterministic detail, free-form/template state,
      online media upload, delivery status, tenant-bound SQLite offline text/template queue and
      failed-send recovery. Personal WhatsApp QR/Web automation and restricted Android permissions
      are absent.
- [x] Web and mobile use separate feature-scoped, non-persisted Zustand stores for shared transient
      inbox/composer workflow. Conversations, messages, unread totals, templates and provider state
      remain API/TanStack Query state; web selection/filters are URL state and durable mobile replay
      remains SQLite-owned.
- [x] Inbox stores reset on logout, account/membership/tenant switch, support-elevation changes and
      revoked/expired/disabled authentication paths. Store tests prove conversation/draft reset and
      no secret-bearing fields.
- [x] WhatsApp webhook payloads are bound to the configured WABA and phone-number identity after
      signature verification; credential rotation returns the connection to `NOT_VERIFIED`.
- [x] Template variables match the approved numbered placeholders exactly, outbound jobs are claimed
      atomically, delayed retries remain recoverable in PostgreSQL, and late/stale provider statuses
      project deterministically from append-only history.

## Partial or external requirements

- [ ] No live tenant WABA, phone-number ID, access token, app secret, verify token, approved template
      catalogue, consent policy or messaging limits were supplied. Cloud connections therefore remain
      `PENDING_APPROVAL` until webhook verification, provider health and explicit activation succeed.
- [ ] WhatsApp Cloud media upload/download activation requires approved provider credentials and a
      reviewed Meta media-retention flow. Development/private-object media works, but the Cloud
      adapter deliberately fails closed for media rather than pretending to send it.
- [ ] A malware/media-content scanner and approved retention/deletion schedule are not configured;
      all objects remain private and short-lived signed access is audited.
- [ ] Physical-device offline/replay/media smoke, live Meta webhook/status/template sync and hosted
      Cloudflare/Render/Supabase/Upstash/Tigris validation have not run.
- [ ] Cloudflare/OpenNext packaging still requires the documented Linux/CI/WSL rerun after the
      Windows symlink limitation.

## Last verified results (2026-08-08)

| Command                          | Result | Actual evidence                                                                                              |
| -------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile` | Pass   | Final frozen install reported the 11-workspace lockfile and installation up to date.                         |
| `pnpm format:check`              | Pass   | Repository formatting check passed after Phase 5 formatting.                                                 |
| `pnpm lint`                      | Pass   | All workspace lint tasks passed.                                                                             |
| `pnpm type-check`                | Pass   | 13/13 strict workspace TypeScript tasks passed.                                                              |
| `pnpm test`                      | Pass   | 289 tests passed; after the final mobile read/reset edit, `@gdm/mobile` was rerun at 75/75.                  |
| `pnpm test:integration`          | Pass   | API migrated-PGlite 31/31 and database migration 15/15 passed.                                               |
| `pnpm db:check`                  | Pass   | Drizzle accepted the 17-entry journal through `0016_steady_may_parker.sql`.                                  |
| `pnpm build`                     | Pass   | API, 15-route Next web, Android/iOS Expo and shared builds passed; final affected mobile exports were rerun. |

The migrated PGlite chain and seed/unit coverage are current. No production database, WABA, provider,
message, object-storage or external deployment state was changed.

## Database and environment changes

- `0014_bouncy_pete_wisdom.sql` creates the Phase 5 domain and permissions.
- `0015_slimy_lenny_balinger.sql` adds stronger queue, Team, membership and actor foreign keys.
- `0016_steady_may_parker.sql` adds outbound request fingerprints for safe idempotency reuse.
- Backend-only `MESSAGING_*` variables cover development signatures, AES-256-GCM credential
  protection, media limits/URL TTL/retention days, retry attempts, service-window hours and
  raw-webhook retention.
- The post-Phase-5 architecture amendment has `DATABASE MIGRATION: NONE`; the journal remains at 17
  entries through `0016_steady_may_parker.sql`.
- Alpha development seed enables `INBOX`, creates one official-messaging fixture connection and two
  approved templates. Beta remains disabled to preserve module-flag evidence.

## Final gate

`PHASE 5 CODE COMPLETE — EXTERNAL VALIDATION REMAINS`

`READY TO BEGIN PHASE 6`

`CLOUDFLARE LINUX PACKAGING EXTERNAL VALIDATION REMAINS`

Do not represent the development adapter as a live WhatsApp provider or enable personal WhatsApp
Web/QR automation.
