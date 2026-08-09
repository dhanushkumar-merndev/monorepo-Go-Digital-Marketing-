# Go Digital Automobile CRM Design System

## Product philosophy

Go Digital is professional, modern, operational, trustworthy, fast, role-aware, accessible and responsive. It is information-dense without clutter. **Clarity > decoration** and **workflow speed > visual novelty**.

## Visual direction

The application uses a deep-navy navigation frame, a soft neutral application canvas, white working surfaces and a strong blue primary action. Semantic colours are restrained and never the only way a state is communicated. Avoid gradients, glass effects, neon, dashboard-template decoration, heavy shadows and arbitrary coloured cards.

## Tokens

Tokens live in `packages/design-tokens/src/tokens.css` and `packages/design-tokens/src/index.ts`; pages must not introduce raw page-level colour values. The semantic palette is app canvas, primary surface, deep-navy sidebar, blue action, strong/slate/muted text, subtle border and neutral/info/success/warning/danger status tokens. Violet is reserved for an approved future AI semantic only.

## Typography, spacing and elevation

Use the existing Inter/system font stack. Page titles are 24–28px, section titles 18–20px, card titles 14–16px, body text 14px, compact table text 13–14px and meta text 12–13px. Use the 4, 8, 12, 16, 20, 24, 32, 40 and 48px scale. Desktop page padding is 24–32px, laptop 20–24px and mobile 16px. Controls use 6–8px radii; cards use 10–12px; dialogs/drawers use 12–16px. Prefer borders and subtle elevation.

## Application shell

`AppShell` is the only protected web shell. Desktop uses a dark, permission-aware sidebar, a 60px utility bar and a fluid workspace. Mobile uses the existing accessible navigation drawer. Navigation is tenant-, module- and permission-aware; hidden items never substitute for backend authorization.

## Shared primitives

- `PageHeader` provides the consistent title, context and action area.
- `Card`, `Button`, `Table`, `StatusBadge`, `Skeleton` and `EmptyState` in `@gdm/ui` establish shared surface, action, state and loading language.
- Data-list screens use a filter toolbar followed by a single responsive table shell; on small screens the table remains horizontally scrollable rather than compressing operational information to unreadable sizes.
- Forms retain visible labels, helper text and inline errors; placeholders do not replace labels.
- Timelines use a concise chronological rail, event, actor/context and timestamp—not a large card per event.

## Status, forms and tables

Use only neutral, info, success, warning and danger status tones. Labels must retain their text meaning. Tables use subtle row separators, strong identity fields, visible hover/focus treatment and labelled actions. Icon-only controls need an accessible name. Empty, error, permission and loading states must explain the situation and, where safe, offer recovery.

## Responsive and mobile rules

Validate at 1920, 1440, 1366, 1280, 1024, 768, 430, 390 and 360px. Preserve the page action and readable type; collapse secondary content rather than shrinking the entire desktop layout. Mobile keeps 44px+ touch targets, a maximum of five primary destinations, accessible bottom/drawer patterns and current Phase 0–4 functionality only. Use project-owned native primitives; web components are never imported into Expo.

## Accessibility and motion

Maintain semantic HTML, labels, visible focus, keyboard navigation, table semantics, dialog focus handling, non-colour status text and AA-oriented contrast. Motion is 120–220ms and only supports navigation or state changes. `prefers-reduced-motion` disables nonessential animation.

## Page archetypes

1. Operational dashboard
2. Management dashboard
3. Data list
4. Entity 360
5. Workflow form
6. Monitoring workspace
7. Administration workspace

## Reference analysis matrix

| Reference family                                  | Role / phase      | Reusable pattern                                              | Go Digital treatment                                                          |
| ------------------------------------------------- | ----------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Telecaller, consultant and manager dashboards     | Current Phase 3–4 | Attention-led KPIs, work queues, compact trends               | Use only API-backed operational facts; no fabricated charts or metrics.       |
| Lead list, follow-up and call-monitor screens     | Current Phase 3–4 | Filter toolbar, strong identity column, status scanning       | Shared accessible data-list pattern with assignment scope preserved.          |
| Customer 360 and activity screens                 | Current Phase 3–4 | Entity header, focused actions, chronological activity        | Canonical Contact/Lead and three-owner model remain unchanged.                |
| Telephony and recording screens                   | Current Phase 4   | Call timeline, outcome queue, provenance                      | Private, consent-gated recording UX; provider/debug detail stays secondary.   |
| Client, user, branch, team and permission screens | Current Phase 2   | Administration workspace and hierarchy scanning               | Reuse current tenant-scoped controls; do not invent RBAC inheritance.         |
| Mobile home, lead list, customer and call screens | Current Phase 3–4 | Compact work queue, action-first detail, mobile call summary  | Existing Expo flow with safe `tel:` and provider-call boundaries.             |
| Unified Inbox and official WhatsApp               | Current Phase 5   | Three-pane inbox, chronological messages and customer context | One channel-neutral CRM inbox; only official WhatsApp is active in Phase 5.   |
| Test ride and physical inventory                  | Current Phase 6–7 | Active-job operations, dense stock lists and evidence history | API-backed jobs/stock only; physical units never become Lead lifecycle state. |
| Booking, delivery, RTO, reports, AI and social    | Future phases     | Layout inspiration only                                       | Not implemented by this phase.                                                |

# Client State Management

## Authoritative Server State

PostgreSQL, NestJS APIs and TanStack Query/cache remain authoritative for Contacts, Leads,
conversations, messages, statuses, unread totals, permissions, provider state and every other CRM
record. Zustand must not duplicate complete server records or become a second business-data cache.

## Shared Client UI State

Zustand is the canonical layer for transient UI/workflow state shared by multiple components in one
client application. Use focused selectors and small feature-scoped stores; do not create a whole-app
business-data store.

## Component Local State

Keep isolated input feedback, one-component disclosure and other local concerns in React state. Do
not migrate every `useState` merely because Zustand exists.

## URL State

Route identifiers and shareable page, sort and filter state belong in route/search parameters. Do
not mirror URL-authoritative state in Zustand unless an explicit synchronization contract names one
source of truth.

## Web

Web stores are used only from Client Components and are never mutable request-global server state.
Server Components remain the default where appropriate. Browser storage is not accessed during SSR,
and store defaults must hydrate deterministically.

## Mobile

Expo uses separate native stores suited to its navigation and device lifecycle. Web and mobile may
share types and pure helpers, but never one mutable store implementation.

## Persistence

Stores are transient by default. Persistence is allow-list only for harmless preferences with an
explicit sensitivity review, storage choice and test. Phase 5 inbox stores use no persistence.

## Sensitive Data

Do not persist message history, drafts, attachments, signed media URLs, customer/Lead caches,
financial/government-document data, credentials or unrestricted PII in ordinary Zustand,
`localStorage`, `sessionStorage` or AsyncStorage.

## Authentication

Authentication and provider credentials remain outside Zustand UI stores. Web session handling and
mobile SecureStore remain authoritative; access tokens, refresh tokens, passwords, API keys and
provider secrets are prohibited store fields.

Agency Admin authentication is a two-stage server-owned flow. Password or Google verification
creates only a short-lived opaque MFA challenge; no refresh session exists until encrypted TOTP or
a single-use recovery code is verified. Enrollment secrets use an active-key/previous-key AES-GCM
keyring, accepted TOTP time steps prevent replay, and browser UI displays recovery codes once.

## Offline

Durable mobile commands remain in the tenant-bound SQLite outbox. Zustand coordinates transient UI
only and must not replace queued operations, idempotency keys or server reconciliation.

## Store Structure

Prefer small feature stores such as `inbox-ui.store.ts`. Store only scalar IDs, transient drafts and
presentation state actually shared by the feature, and select individual fields/actions to limit
rerenders.

## Tenant/User Reset

Logout, account switch, membership/tenant switch, support-context start/end and terminal session
loss must reset selected customer/conversation context, drafts, reply/attachment state, bulk
selection and temporary panels before another context can render.

# Unified Inbox Channel Architecture

Go Digital has one channel-agnostic Unified Inbox, not separate WhatsApp, Instagram, Facebook, SMS
or email CRM products. The canonical Conversation/Message model reuses the Phase 3 Contact as the
long-lived person identity, links the applicable Lead/opportunity, retains a separate Conversation
Owner and appends communication to the shared activity timeline.

Phase 5 activates **official WhatsApp Business Platform messaging only** through the generic
messaging provider port and the WhatsApp Cloud adapter. WABA/phone identity, Meta credentials,
signature and payload rules, approved-template semantics, service-window policy and provider media
identifiers remain inside the WhatsApp/provider boundary. Personal WhatsApp QR, WhatsApp Web
scraping and unofficial automation are prohibited.

Instagram Direct Messages and Facebook Messenger remain Phase 13 candidates; SMS, email and other
approved channels remain future work. A future adapter must reuse the canonical Conversation,
Message, Contact/Lead context, Conversation Owner, authorization and inbox UI where the official API
permits it. Unsupported channels must be labelled deferred and must not be reported as connected or
implemented.

## Vehicle inventory client-state contract

Inventory stock, VIN/chassis/engine identity, reservations, allocations, transfer state and
optimistic versions remain API/TanStack Query data. The web inventory Zustand store is
non-persisted and owns only form visibility and table density. Shareable inventory view/search and
physical-unit identifiers remain in URL routes. Full identifiers, booking references and history
must never be persisted in the store or browser storage, and the store resets with every existing
authentication, tenant, membership and support-context teardown boundary.

## Future-phase contract

Every future phase must read this file, use the existing AppShell and semantic tokens, follow the
client-state and Unified Inbox contracts above, reuse shared components, preserve responsive and
accessibility rules, avoid a new UI framework or duplicate primitives, and update this document only
for durable system-wide design changes.

# Release and Maintenance Architecture

Production promotion is migration-first and manual. Render API/worker revisions, the Cloudflare
OpenNext Worker and EAS mobile candidates must share an immutable release identity. PostgreSQL is
the recovery source of truth; Redis/BullMQ accelerates work but recurring reminder and messaging
maintenance schedules replay durable rows after interruption.

Messaging ingress applies byte/event budgets and provider/connection rate limits. Webhook work uses
atomic PostgreSQL claims with expiring leases. Outbound sends use distributed provider and
tenant/provider concurrency permits; an interrupted send with unknown provider acceptance is
dead-lettered for reconciliation rather than automatically duplicated. The retention sweep redacts
expired raw webhook PII and deletes expired private media through the storage adapter.
