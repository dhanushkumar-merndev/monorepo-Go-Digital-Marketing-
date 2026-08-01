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

# PHASE 8 — BOOKING, BILLING, PAYMENTS, FINANCE AND DOCUMENTS

## Objective

Implement booking confirmation, financial-status tracking and readiness without processing customer money.

## Entities

Bookings, items, price components, discounts, payment entries/proofs, finance cases, invoices, insurance, booking documents, verification events and delivery-readiness gate.

## Payment types

Full, Partial, Finance, Installment and Mixed.

## Rules

- CRM tracks status; it is not the accounting ledger/payment processor.
- Entries are append-only; corrections use reversal/correction events.
- Uploaded proof is not automatically verified payment.
- Verification requires permission.
- Balance derives from verified components.
- Discount approval uses configurable thresholds.
- Finance approval and disbursement are separate.
- Cancellation/refund tracking requires reason/approval.
- VIN linkage preserves inventory history.
- Delivery requires configured readiness.

## Document centre

Private upload, document type, Pending/Approved/Rejected/Expired, reason, version history, signed download, download audit, preferred delivery channel and OTP-ready secure-link boundary.

## Web screens

Booking list/detail, price breakdown, discount approval, payment entry/verification, finance, invoice, insurance, document checklist/verification, allocation summary and readiness checklist.

## Acceptance criteria

- Balance cannot become negative through ordinary entries.
- Unverified payment is not completed.
- Correction preserves original history.
- Unauthorized verification is denied.
- Documents are private.
- Readiness fails when mandatory conditions are incomplete.
