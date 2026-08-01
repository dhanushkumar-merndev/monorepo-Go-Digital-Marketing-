You are working inside the existing Go Digital Automobile CRM repository.

Read these before making changes:

1. `Go_Digital_Automobile_CRM_10_on_10_Final_Technical_PRD_v4_0.docx`
2. `AGENTS.md`
3. `docs/implementation/PHASE_STATUS.md`
4. `docs/implementation/DECISIONS.md`
5. `docs/implementation/KNOWN_ISSUES.md`
6. `docs/implementation/NEXT_PHASE_HANDOFF.md`
7. Existing source code, migrations and tests related to this phase

Do not regenerate the entire project. Inspect the current implementation first and preserve working code and accepted architectural decisions.

Before coding:

- Summarize the existing state.
- Identify this phase's dependencies.
- List the modules/files you expect to change.
- Identify blocking inconsistencies.
- Then proceed without waiting unless an irreversible business decision is genuinely missing.

Implement only the phase below. At completion, run the mandatory checks and update all implementation tracking documents required by `AGENTS.md`.

---

# PHASE 3 — LEAD CAPTURE, LIFECYCLE, ASSIGNMENT AND SLA

## Objective

Implement the complete internal lead-management foundation.

## Lead sources

Use exactly: META, WHATSAPP_AD, GOOGLE_ADS, WEBSITE, WALK_IN and OTHER. Manual entry is an entry method, not automatically a source.

## Required entities

Contacts, contact channels, consent records, lead opportunities, source metadata, campaign attribution, assignments, ownership fields, status history, rejection/lost/reopen events, follow-ups, notes, tasks, assignment queues, SLA timers and escalations.

## Lifecycle

Support New, Pending Review, Contact Attempt, Accepted, Rejected, Contacted, Interested, Follow-up, Showroom Visit, Test Ride Requested, Test Ride Booked, Test Ride Completed, Negotiation, Booking Confirmed, Lost and Reopened.

Do not collapse Rejected and Lost.

Rejection reasons: Invalid number, Duplicate, Not interested at first contact, Outside service area, Wrong enquiry, Already purchased, Spam.

Lost reasons: Price, Finance rejected, Model unavailable, Competitor purchase, Postponed, No response, Family decision, Other.

## Assignment

Manual and round-robin assignment, branch/team eligibility, working-hours awareness, active-user filtering, reassignment reason/history and the three-owner model.

## Deduplication

Normalize Indian phone numbers. Do not globally merge across tenants. Support candidate review, canonical contacts and legitimate repeat opportunities. Never silently destructively merge.

## Public endpoint

Create `/v1/public/lead-forms/{clientFormKey}` with validation, rate limits, consent evidence, UTM/GCLID/page URL, idempotency, bot-protection adapter and atomic lead creation/assignment/outbox.

## Web screens

Lead inbox/list/detail, customer timeline, manual creation, duplicate review, assignment queue, follow-ups, SLA breach queue, rejected/lost lists, reopen action and source/campaign filters.

## Mobile screens

Assigned leads, details, accept/reject, contact outcome, follow-up, notes, transitions, showroom update and safe offline outbox.

## Acceptance criteria

- Duplicate events do not create duplicate leads.
- Invalid transitions are rejected.
- Rejected/lost history is searchable.
- Reopening preserves source/history.
- Round robin skips inactive/ineligible users.
- SLA behaviour is deterministic and tested.
- Salesperson sees only assigned leads.
- Reassignment requires reason and audit.
