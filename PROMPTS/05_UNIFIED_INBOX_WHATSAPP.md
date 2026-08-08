You are working inside the existing Go Digital Automobile CRM repository.

Read these before making changes:

1. `Go_Digital_Automobile_CRM_10_on_10_Final_Technical_PRD_v4_0.docx`
2. `DESIGN.md`
3. `AGENTS.md`
4. `docs/implementation/PHASE_STATUS.md`
5. `docs/implementation/DECISIONS.md`
6. `docs/implementation/KNOWN_ISSUES.md`
7. `docs/implementation/NEXT_PHASE_HANDOFF.md`
8. Existing source code, migrations and tests related to this phase

Do not regenerate the entire project. Inspect the current implementation first and preserve working code and accepted architectural decisions.

Before coding:

- Summarize the existing state.
- Identify this phase's dependencies.
- List the modules/files you expect to change.
- Identify blocking inconsistencies.
- Then proceed without waiting unless an irreversible business decision is genuinely missing.

Implement only the phase below. At completion, run the mandatory checks and update all implementation tracking documents required by `AGENTS.md`.

---

# PHASE 5 — UNIFIED INBOX AND WHATSAPP PLATFORM FOUNDATION

## UNIFIED INBOX CHANNEL SCOPE

Phase 5 implements the channel-neutral Unified Inbox foundation plus official WhatsApp Business
Platform messaging only. Instagram Direct Messages and Facebook Messenger are not Phase 5
implementation requirements; SMS and email provider integrations also remain deferred. Future
approved channels must reuse the same canonical Conversation, Message, Contact/Lead context,
Conversation Owner, timeline, authorization and inbox UI instead of creating disconnected inbox
products. Keep core naming channel-neutral where compatibility permits and keep WABA identity,
Meta templates/service-window rules, webhook payloads, media IDs and credentials inside the
WhatsApp/provider boundary. Personal WhatsApp QR, WhatsApp Web scraping and unofficial automation
remain prohibited.

## Objective

Implement provider-neutral conversations and WhatsApp Cloud API-ready architecture.

Use Zustand only for transient, shared inbox UI/workflow state such as the active composer mode,
draft coordination and customer-panel visibility. TanStack Query/API data remains authoritative for
conversations, messages, ownership, delivery status, templates and connection state. Put shareable
conversation selection and filters in the URL, keep isolated controls local, persist no message
content or credentials, and reset the inbox store on logout and every tenant, account, membership or
support-context change.

Use canonical Phase 3 Contacts/Leads and the Phase 2 conversation-owner/team scope. Personal
WhatsApp QR or unofficial WhatsApp Web automation is prohibited; use official provider APIs.

## Entities

Conversations, participants, messages, media, templates, statuses, assignments, integration connections, webhook events, outbound outbox and opt-in/suppression records.

## Behaviour

Continuous customer timeline, Contact/Lead links, inbound/outbound messages, free-form/template rules, sent/delivered/read/failed statuses, media, assignment, Conversation Owner, routing, retry/dead letter, idempotency and provider/local ordering.

## Per-client WhatsApp data

WABA ID, phone-number ID, encrypted token, webhook state, template sync, quality/connection placeholders and tenant limits. Keep embedded-onboarding-ready boundaries. Never use personal WhatsApp Web automation.

For Click-to-WhatsApp ads, create a lead on first inbound customer message unless a separate verified lead event exists.

## Web screens

Unified inbox/list/detail, customer panel, internal notes, template selector, media, queue assignment, integration status, failures and template catalogue.

## Mobile screens

Assigned conversations, detail, free-form/template state, template/media send, statuses, safe offline queue and failed-send recovery.

## Acceptance criteria

- Cross-tenant messaging is impossible.
- Backend enforces template restrictions.
- Duplicate webhooks do not duplicate messages.
- Retries are safe.
- Conversation ownership remains separate.
- Timeline ordering is deterministic.
