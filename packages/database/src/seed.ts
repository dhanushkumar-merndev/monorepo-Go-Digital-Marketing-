import { createHash, scrypt } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';

import { createDatabaseConnection } from './connection.js';
import {
  CANONICAL_ROLE_CODES,
  PERMISSION_CODES,
  agencies,
  agencyDefaults,
  assignmentQueueMembers,
  assignmentQueues,
  authenticationIdentities,
  branchWorkingHours,
  branches,
  clientOrganizations,
  clientAdministrationSettings,
  clientIntegrationReadiness,
  clientModuleFlags,
  departments,
  demoVehicleBookings,
  contacts,
  bookingItems,
  bookings,
  commercialSettings,
  financeCaseEvents,
  financeCases,
  deliveryChecklistItems,
  deliveryJobs,
  deliverySettings,
  deliveryStatusEvents,
  registrationCases,
  registrationEvents,
  registrationSettings,
  customerVehicles,
  customerVehicleEvents,
  customerReminderPlans,
  customerReminderPreferences,
  paymentEntries,
  paymentVerificationEvents,
  quotationPriceComponents,
  quotationVersions,
  quotations,
  leadSettings,
  leadOpportunities,
  inventoryBrands,
  inventoryAllocations,
  inventoryColours,
  inventoryModels,
  inventoryUnitStatusHistory,
  inventoryUnits,
  inventoryVariants,
  membershipBranchScopes,
  membershipDepartmentScopes,
  membershipTeamScopes,
  memberships,
  messageTemplates,
  messagingProviderConnections,
  permissions,
  reminderDefinitions,
  reminderEvents,
  reminderInstances,
  reminderRuleTemplates,
  publicLeadForms,
  rolePermissionMappings,
  reportingLines,
  roles,
  teamManagerAssignments,
  teamMemberships,
  teams,
  telephonyProviderConnections,
  testRideEvents,
  testRideJobs,
  users,
} from './schema/index.js';

type RoleCode = (typeof CANONICAL_ROLE_CODES)[number];
type PermissionCode = (typeof PERMISSION_CODES)[number];

const DEVELOPMENT_SEED_PASSWORD =
  process.env.SEED_DEVELOPMENT_PASSWORD ?? 'GoDigital-Dev-Only-2026!';
const DEVELOPMENT_PASSWORD_PEPPER =
  process.env.AUTH_PASSWORD_PEPPER ?? 'local-development-password-pepper-change-me';
const SEED_DATE = new Date('2026-08-01T00:00:00.000Z');

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 64;

const AGENCY_ID = '10000000-0000-4000-8000-000000000001';
const ALPHA_CLIENT_ID = '20000000-0000-4000-8000-000000000001';
const BETA_CLIENT_ID = '20000000-0000-4000-8000-000000000002';
const ALPHA_PUNE_BRANCH_ID = '21000000-0000-4000-8000-000000000001';
const ALPHA_MUMBAI_BRANCH_ID = '21000000-0000-4000-8000-000000000002';
const BETA_NASHIK_BRANCH_ID = '21000000-0000-4000-8000-000000000003';
const ALPHA_PUNE_DEPARTMENT_ID = '21500000-0000-4000-8000-000000000001';
const ALPHA_MUMBAI_DEPARTMENT_ID = '21500000-0000-4000-8000-000000000002';
const BETA_NASHIK_DEPARTMENT_ID = '21500000-0000-4000-8000-000000000003';
const ALPHA_PUNE_TEAM_ID = '22000000-0000-4000-8000-000000000001';
const ALPHA_MUMBAI_TEAM_ID = '22000000-0000-4000-8000-000000000002';
const BETA_NASHIK_TEAM_ID = '22000000-0000-4000-8000-000000000003';
const ALPHA_MESSAGING_CONNECTION_ID = '23000000-0000-4000-8000-000000000001';
const ALPHA_TEST_RIDE_CONTACT_ID = '25000000-0000-4000-8000-000000000001';
const ALPHA_TEST_RIDE_LEAD_ID = '26000000-0000-4000-8000-000000000001';
const ALPHA_TEST_RIDE_JOB_ID = '27000000-0000-4000-8000-000000000001';
const ALPHA_TEST_RIDE_EVENT_ID = '28000000-0000-4000-8000-000000000001';
const ALPHA_TEST_RIDE_BOOKING_ID = '29000000-0000-4000-8000-000000000001';
const ALPHA_INVENTORY_BRAND_ID = '2a000000-0000-4000-8000-000000000001';
const ALPHA_INVENTORY_MODEL_ID = '2b000000-0000-4000-8000-000000000001';
const ALPHA_INVENTORY_VARIANT_ID = '2c000000-0000-4000-8000-000000000001';
const ALPHA_INVENTORY_COLOUR_ID = '2d000000-0000-4000-8000-000000000001';
const ALPHA_DEMO_INVENTORY_UNIT_ID = '2e000000-0000-4000-8000-000000000001';
const ALPHA_DEMO_INVENTORY_HISTORY_ID = '2f000000-0000-4000-8000-000000000001';
const ALPHA_COMMERCIAL_QUOTATION_ID = '71000000-0000-4000-8000-000000000001';
const ALPHA_COMMERCIAL_QUOTATION_VERSION_ID = '72000000-0000-4000-8000-000000000001';
const ALPHA_COMMERCIAL_BOOKING_ID = '73000000-0000-4000-8000-000000000001';
const ALPHA_COMMERCIAL_PAYMENT_ID = '74000000-0000-4000-8000-000000000001';
const ALPHA_COMMERCIAL_PAYMENT_EVENT_ID = '75000000-0000-4000-8000-000000000001';
const ALPHA_COMMERCIAL_FINANCE_ID = '76000000-0000-4000-8000-000000000001';
const ALPHA_COMMERCIAL_FINANCE_EVENT_ID = '77000000-0000-4000-8000-000000000001';
const ALPHA_DELIVERY_INVENTORY_UNIT_ID = '78000000-0000-4000-8000-000000000001';
const ALPHA_DELIVERY_INVENTORY_HISTORY_ID = '78000000-0000-4000-8000-000000000002';
const ALPHA_DELIVERY_ALLOCATION_ID = '79000000-0000-4000-8000-000000000001';
const ALPHA_DELIVERY_JOB_ID = '7a000000-0000-4000-8000-000000000001';
const ALPHA_DELIVERY_EVENT_ID = '7b000000-0000-4000-8000-000000000001';
const ALPHA_REGISTRATION_CASE_ID = '7c000000-0000-4000-8000-000000000001';
const ALPHA_REGISTRATION_EVENT_ID = '7d000000-0000-4000-8000-000000000001';
const ALPHA_EXTERNAL_CUSTOMER_VEHICLE_ID = '7e000000-0000-4000-8000-000000000001';
const ALPHA_EXTERNAL_CUSTOMER_VEHICLE_EVENT_ID = '7f000000-0000-4000-8000-000000000001';
const ALPHA_SERVICE_REMINDER_RULE_ID = '81000000-0000-4000-8000-000000000001';
const ALPHA_UPGRADE_REMINDER_RULE_ID = '81000000-0000-4000-8000-000000000002';
const ALPHA_SERVICE_REMINDER_PLAN_ID = '82000000-0000-4000-8000-000000000001';

const roleIdByCode = Object.fromEntries(
  CANONICAL_ROLE_CODES.map((code, index) => [
    code,
    `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  ]),
) as Record<RoleCode, string>;

const permissionIdByCode = Object.fromEntries(
  PERMISSION_CODES.map((code, index) => [
    code,
    `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  ]),
) as Record<PermissionCode, string>;

const roleDefinitions: readonly {
  code: RoleCode;
  displayName: string;
  contextType: 'AGENCY' | 'CLIENT';
  application: 'WEB' | 'MOBILE';
  description: string;
}[] = [
  {
    code: 'AGENCY_ADMIN',
    displayName: 'Agency Admin',
    contextType: 'AGENCY',
    application: 'WEB',
    description: 'Platform client lifecycle and reasoned, time-bound support access.',
  },
  {
    code: 'CLIENT_ADMIN',
    displayName: 'Client Admin',
    contextType: 'CLIENT',
    application: 'WEB',
    description: 'Client-wide identity, role, branch and settings administration.',
  },
  {
    code: 'MANAGER',
    displayName: 'Manager',
    contextType: 'CLIENT',
    application: 'WEB',
    description: 'Client-wide operational visibility and controlled exception handling.',
  },
  {
    code: 'SALES_MANAGER',
    displayName: 'Sales Manager',
    contextType: 'CLIENT',
    application: 'WEB',
    description: 'Assigned branch and team supervision.',
  },
  {
    code: 'TELECALLER',
    displayName: 'Telecaller',
    contextType: 'CLIENT',
    application: 'WEB',
    description: 'Assigned queue contact, qualification and handoff.',
  },
  {
    code: 'SALESPERSON',
    displayName: 'Salesperson',
    contextType: 'CLIENT',
    application: 'MOBILE',
    description: 'Owned or assigned lead activity on Android.',
  },
  {
    code: 'TEST_RIDE_EXECUTIVE',
    displayName: 'Test Ride Executive',
    contextType: 'CLIENT',
    application: 'MOBILE',
    description: 'Assigned test-ride execution on Android.',
  },
  {
    code: 'INVENTORY_EXECUTIVE',
    displayName: 'Inventory Executive',
    contextType: 'CLIENT',
    application: 'WEB',
    description: 'Assigned branch stock and vehicle allocation operations.',
  },
  {
    code: 'BILLING_DOCUMENTATION_EXECUTIVE',
    displayName: 'Billing and Documentation Executive',
    contextType: 'CLIENT',
    application: 'WEB',
    description: 'Assigned booking billing and documentation cases.',
  },
  {
    code: 'DELIVERY_EXECUTIVE',
    displayName: 'Delivery Executive',
    contextType: 'CLIENT',
    application: 'MOBILE',
    description: 'Assigned delivery execution on Android.',
  },
  {
    code: 'RC_REGISTRATION_EXECUTIVE',
    displayName: 'RC and Registration Executive',
    contextType: 'CLIENT',
    application: 'WEB',
    description: 'Assigned registration and RC cases.',
  },
  {
    code: 'TEAM_MANAGER',
    displayName: 'Team Manager',
    contextType: 'CLIENT',
    application: 'WEB',
    description: 'Canonical supervision of assigned team members and their lead workload.',
  },
];

const permissionDescriptions: Record<PermissionCode, string> = {
  'account.profile.read': 'Read the authenticated user profile.',
  'account.profile.update': 'Update the authenticated user profile.',
  'account.sessions.read': 'List the authenticated user sessions and devices.',
  'account.sessions.revoke': 'Revoke the authenticated user sessions and devices.',
  'account.tenant.select': 'Select one of the authenticated user active memberships.',
  'organization.clients.read': 'Read permitted client organization summaries.',
  'organization.branches.read': 'Read branches within effective tenant and branch scope.',
  'organization.departments.read': 'Read departments within effective branch and department scope.',
  'organization.teams.read': 'Read teams within effective tenant and team scope.',
  'organization.users.read': 'Read client users within effective scope.',
  'organization.users.manage': 'Manage client users and memberships.',
  'organization.roles.read': 'Read role and permission definitions.',
  'organization.roles.manage': 'Manage client role mappings.',
  'organization.sessions.manage': 'Revoke another client user session with audit evidence.',
  'organization.branches.manage': 'Create and update branches within the active client.',
  'organization.departments.manage': 'Create and update departments within the active client.',
  'organization.hierarchy.read': 'Read team membership, Team Manager and reporting relationships.',
  'organization.hierarchy.manage': 'Manage reasoned team and reporting relationships.',
  'organization.teams.manage': 'Create and update teams within the active client.',
  'organization.settings.manage': 'Configure client profile, working hours and retention settings.',
  'organization.audit.read': 'Read account and permission administration audit events.',
  'platform.agencies.manage': 'Manage agency-level platform configuration.',
  'platform.clients.manage': 'Manage client organization lifecycle.',
  'platform.defaults.manage': 'Configure safe agency-wide administrative defaults.',
  'platform.support_elevation.manage': 'Create and revoke reasoned support elevation.',
  'leads.read': 'Read leads permitted by tenant, branch, team and assignment scope.',
  'leads.create': 'Create lead opportunities and contact evidence.',
  'leads.transition': 'Record valid lead lifecycle transitions and outcomes.',
  'leads.assign': 'Assign and reassign leads with reasoned history.',
  'leads.followups.manage': 'Create and complete lead follow-ups.',
  'leads.notes.create': 'Append notes to permitted leads.',
  'leads.tasks.manage': 'Create and complete lead tasks.',
  'leads.duplicates.manage': 'Review tenant-scoped duplicate candidates.',
  'leads.sla.manage': 'Review and reconcile lead SLA timers and escalations.',
  'telephony.calls.read': 'Read call history within tenant and lead assignment scope.',
  'telephony.calls.start': 'Start a provider call or tel: fallback for a permitted lead.',
  'telephony.outcomes.manage': 'Record a call outcome and callback follow-up.',
  'telephony.outcomes.override': 'Approve a reasoned supervisor outcome exception.',
  'telephony.recordings.read': 'Request a private recording URL after consent checks.',
  'telephony.recordings.upload': 'Create a private manual recording upload for an authorized Lead.',
  'telephony.connections.manage': 'Configure tenant telephony connections.',
  'telephony.reconciliation.manage': 'Run idempotent provider reconciliation.',
  'telephony.health.read': 'Read telephony provider and webhook health.',
  'messaging.conversations.read': 'Read conversations within tenant and conversation-owner scope.',
  'messaging.messages.send': 'Send policy-compliant free-form or approved-template messages.',
  'messaging.notes.create': 'Append internal notes to scoped conversations.',
  'messaging.assignments.manage': 'Assign conversation owners and queue teams with history.',
  'messaging.templates.read': 'Read message templates and provider approval state.',
  'messaging.templates.manage': 'Synchronize and manage tenant templates.',
  'messaging.connections.manage': 'Configure encrypted official messaging connections.',
  'messaging.failures.manage': 'Inspect and retry failed or dead-letter messages.',
  'messaging.media.read': 'Request scoped private message media access.',
  'messaging.media.upload': 'Upload private outbound message media.',
  'test_rides.read': 'Read test rides within tenant, branch, team and assignment scope.',
  'test_rides.schedule': 'Schedule, book and confirm test rides for scoped Leads.',
  'test_rides.assign': 'Assign or reassign an eligible Test Ride Executive.',
  'test_rides.execute': 'Start and finish only an assigned test-ride job.',
  'test_rides.location.write': 'Submit location only during an explicitly active assigned ride.',
  'test_rides.active_map.read': 'Read ACTIVE rides and their stale-aware current location.',
  'test_rides.cancel': 'Cancel a scoped test ride with a mandatory reason.',
  'inventory.catalogue.read': 'Read the tenant vehicle catalogue.',
  'inventory.catalogue.manage': 'Create tenant vehicle catalogue records.',
  'inventory.units.read': 'Read branch-scoped physical stock with masked identifiers.',
  'inventory.units.sensitive.read': 'Read full VIN, chassis and engine identifiers.',
  'inventory.units.manage': 'Create, receive and manage physical inventory units.',
  'inventory.reservations.manage': 'Create, extend, expire and release inventory reservations.',
  'inventory.allocations.manage': 'Allocate and release a physical unit for a booking.',
  'inventory.allocations.reallocate': 'Approve reasoned VIN reallocation between physical units.',
  'inventory.transfers.manage': 'Start and finish immutable branch transfers.',
  'inventory.corrections.manage': 'Perform controlled blocked, cancelled or removed corrections.',
  'commercial.bookings.read': 'Read branch-scoped commercial bookings and derived balances.',
  'commercial.bookings.manage': 'Create confirmed bookings from approved quotation versions.',
  'commercial.bookings.cancel':
    'Cancel a booking with approval, settlement and notification evidence.',
  'commercial.quotations.manage':
    'Create and revise versioned quotations using minor-unit amounts.',
  'commercial.discounts.approve':
    'Approve or reject discounts above the effective tenant threshold.',
  'commercial.payments.record':
    'Append payment entries and proof references without verifying them.',
  'commercial.payments.verify': 'Verify or reject payment evidence.',
  'commercial.payments.correct': 'Post an append-only payment reversal with approval evidence.',
  'commercial.finance.manage': 'Track finance application, approval and disbursement separately.',
  'commercial.insurance.manage': 'Track insurance quotation, payment and policy readiness.',
  'commercial.exchange.manage': 'Create and inspect used-vehicle exchange cases.',
  'commercial.exchange.approve': 'Approve or reject exchange valuation evidence.',
  'commercial.invoices.manage': 'Record immutable invoice references for bookings.',
  'commercial.documents.read': 'Request audited private access to scoped booking documents.',
  'commercial.documents.upload':
    'Initiate and complete validated private booking-document uploads.',
  'commercial.documents.verify': 'Approve or reject uploaded booking documents with reason.',
  'commercial.readiness.read': 'Evaluate the server-authoritative delivery-readiness checklist.',
  'commercial.settings.manage': 'Manage versioned commercial thresholds and readiness policy.',
  'delivery.jobs.read': 'Read scoped delivery jobs and customer-minimized execution details.',
  'delivery.jobs.manage': 'Create, prepare and schedule tenant-scoped delivery jobs.',
  'delivery.jobs.assign': 'Assign an active eligible Delivery Executive within branch scope.',
  'delivery.jobs.execute': 'Execute only an assigned delivery and record reasoned exceptions.',
  'delivery.jobs.cancel': 'Cancel a delivery with a mandatory reason and audit evidence.',
  'delivery.checklists.manage':
    'Record PDI, accessory and handover preparation checklist evidence.',
  'delivery.proofs.upload': 'Capture configured private delivery proof for an assigned job.',
  'delivery.proofs.review': 'Review and access private delivery proof with an audited purpose.',
  'delivery.location.write': 'Submit location only while an assigned delivery is active.',
  'delivery.active_map.read': 'Monitor active delivery locations with stale-state indication.',
  'delivery.reschedules.approve': 'Approve or reject reasoned delivery reschedule requests.',
  'delivery.settings.manage': 'Manage delivery checklist, proof and location policy.',
  'registration.cases.read': 'Read branch or assignment-scoped registration and RC cases.',
  'registration.cases.manage': 'Create registration cases and record controlled corrections.',
  'registration.cases.assign': 'Assign an eligible RC Registration Executive.',
  'registration.cases.execute': 'Advance assigned registration and RC workflow states.',
  'registration.cases.close': 'Close a complete registration case with mandatory evidence.',
  'registration.cases.reopen': 'Reopen a closed registration case with reason and next action.',
  'registration.documents.upload': 'Upload private RC documents through validated signed storage.',
  'registration.documents.review': 'Review and download private RC documents with audit evidence.',
  'registration.documents.share': 'Create an audited RC delivery record and short-lived link.',
  'registration.aging.read': 'Read registration aging and overdue queues.',
  'registration.settings.manage': 'Manage tenant registration SLA thresholds.',
  'customer_vehicles.read': 'Read scoped canonical customer-owned vehicles.',
  'customer_vehicles.manage': 'Create external or delivered-sale vehicles and update coverage.',
  'reminders.read': 'Read scoped customer reminder plans, queues and append-only history.',
  'reminders.rules.manage': 'Manage fixed tenant and vehicle-model reminder rule templates.',
  'reminders.generate': 'Safely generate and refresh reminder plans and instances.',
  'reminders.dispatch.manage': 'Reschedule, cancel and retry reminder delivery work.',
  'reminders.preferences.manage': 'Capture customer reminder channel and category preferences.',
  'customer_activities.create': 'Append feedback, complaint and escalation customer activity.',
  'reports.read': 'Read authoritative, scope-filtered operational KPI dashboards and reports.',
  'reports.export': 'Create and download tenant-scoped, expiring report exports.',
  'audit.events.read': 'Search immutable tenant audit events with sensitive values minimized.',
};

const reportingManagerPermissions = [
  'reports.read',
  'reports.export',
  'audit.events.read',
] as const satisfies readonly PermissionCode[];

const reminderOperatorPermissions = [
  'reminders.read',
  'reminders.generate',
  'reminders.dispatch.manage',
  'reminders.preferences.manage',
  'customer_activities.create',
] as const satisfies readonly PermissionCode[];
const reminderManagerPermissions = [
  ...reminderOperatorPermissions,
  'reminders.rules.manage',
] as const satisfies readonly PermissionCode[];

const registrationReadPermissions = [
  'registration.cases.read',
  'registration.aging.read',
  'customer_vehicles.read',
] as const satisfies readonly PermissionCode[];
const registrationExecutivePermissions = [
  ...registrationReadPermissions,
  'registration.cases.execute',
  'registration.cases.close',
  'registration.documents.upload',
  'registration.documents.review',
  'registration.documents.share',
  'customer_vehicles.manage',
] as const satisfies readonly PermissionCode[];
const registrationManagerPermissions = [
  ...registrationExecutivePermissions,
  'registration.cases.manage',
  'registration.cases.assign',
  'registration.cases.reopen',
  'registration.settings.manage',
] as const satisfies readonly PermissionCode[];

const deliveryManagerPermissions = [
  'delivery.jobs.read',
  'delivery.jobs.manage',
  'delivery.jobs.assign',
  'delivery.jobs.cancel',
  'delivery.checklists.manage',
  'delivery.proofs.upload',
  'delivery.proofs.review',
  'delivery.active_map.read',
  'delivery.reschedules.approve',
  'delivery.settings.manage',
] as const satisfies readonly PermissionCode[];
const deliveryExecutivePermissions = [
  'delivery.jobs.read',
  'delivery.jobs.execute',
  'delivery.checklists.manage',
  'delivery.proofs.upload',
  'delivery.location.write',
] as const satisfies readonly PermissionCode[];

const commercialReadPermissions = [
  'commercial.bookings.read',
  'commercial.documents.read',
  'commercial.readiness.read',
] as const satisfies readonly PermissionCode[];
const commercialSalesPermissions = [
  ...commercialReadPermissions,
  'commercial.quotations.manage',
  'commercial.bookings.manage',
] as const satisfies readonly PermissionCode[];
const commercialBillingPermissions = [
  ...commercialReadPermissions,
  'commercial.bookings.manage',
  'commercial.bookings.cancel',
  'commercial.payments.record',
  'commercial.payments.verify',
  'commercial.finance.manage',
  'commercial.insurance.manage',
  'commercial.exchange.manage',
  'commercial.invoices.manage',
  'commercial.documents.upload',
  'commercial.documents.verify',
] as const satisfies readonly PermissionCode[];
const commercialManagerPermissions = [
  ...commercialBillingPermissions,
  'commercial.quotations.manage',
  'commercial.discounts.approve',
  'commercial.payments.correct',
  'commercial.exchange.approve',
  'commercial.settings.manage',
] as const satisfies readonly PermissionCode[];

const inventoryReadPermissions = [
  'inventory.catalogue.read',
  'inventory.units.read',
] as const satisfies readonly PermissionCode[];
const inventoryOperatorPermissions = [
  ...inventoryReadPermissions,
  'inventory.catalogue.manage',
  'inventory.units.sensitive.read',
  'inventory.units.manage',
  'inventory.reservations.manage',
  'inventory.allocations.manage',
  'inventory.transfers.manage',
] as const satisfies readonly PermissionCode[];
const inventoryManagerPermissions = [
  ...inventoryOperatorPermissions,
  'inventory.allocations.reallocate',
  'inventory.corrections.manage',
] as const satisfies readonly PermissionCode[];

const testRideManagerPermissions = [
  'test_rides.read',
  'test_rides.schedule',
  'test_rides.assign',
  'test_rides.active_map.read',
  'test_rides.cancel',
] as const satisfies readonly PermissionCode[];
const testRideSalesPermissions = [
  'test_rides.read',
  'test_rides.schedule',
  'test_rides.cancel',
] as const satisfies readonly PermissionCode[];
const testRideExecutivePermissions = [
  'test_rides.read',
  'test_rides.execute',
  'test_rides.location.write',
  'test_rides.cancel',
] as const satisfies readonly PermissionCode[];

const leadManagerPermissions = [
  'leads.read',
  'leads.create',
  'leads.transition',
  'leads.assign',
  'leads.followups.manage',
  'leads.notes.create',
  'leads.tasks.manage',
  'leads.duplicates.manage',
  'leads.sla.manage',
] as const satisfies readonly PermissionCode[];
const leadAgentPermissions = [
  'leads.read',
  'leads.transition',
  'leads.followups.manage',
  'leads.notes.create',
  'leads.tasks.manage',
] as const satisfies readonly PermissionCode[];
const telephonyManagerPermissions = [
  'telephony.calls.read',
  'telephony.calls.start',
  'telephony.outcomes.manage',
  'telephony.outcomes.override',
  'telephony.recordings.read',
  'telephony.recordings.upload',
  'telephony.connections.manage',
  'telephony.reconciliation.manage',
  'telephony.health.read',
] as const satisfies readonly PermissionCode[];
const telephonyTeamManagerPermissions = [
  'telephony.calls.read',
  'telephony.calls.start',
  'telephony.outcomes.manage',
  'telephony.recordings.read',
  'telephony.recordings.upload',
  'telephony.health.read',
] as const satisfies readonly PermissionCode[];
const telephonyAgentPermissions = [
  'telephony.calls.read',
  'telephony.calls.start',
  'telephony.outcomes.manage',
  'telephony.recordings.upload',
] as const satisfies readonly PermissionCode[];
const messagingManagerPermissions = [
  'messaging.conversations.read',
  'messaging.messages.send',
  'messaging.notes.create',
  'messaging.assignments.manage',
  'messaging.templates.read',
  'messaging.templates.manage',
  'messaging.connections.manage',
  'messaging.failures.manage',
  'messaging.media.read',
  'messaging.media.upload',
] as const satisfies readonly PermissionCode[];
const messagingTeamManagerPermissions = [
  'messaging.conversations.read',
  'messaging.messages.send',
  'messaging.notes.create',
  'messaging.assignments.manage',
  'messaging.templates.read',
  'messaging.failures.manage',
  'messaging.media.read',
  'messaging.media.upload',
] as const satisfies readonly PermissionCode[];
const messagingAgentPermissions = [
  'messaging.conversations.read',
  'messaging.messages.send',
  'messaging.notes.create',
  'messaging.templates.read',
  'messaging.failures.manage',
  'messaging.media.read',
  'messaging.media.upload',
] as const satisfies readonly PermissionCode[];

const accountPermissions = [
  'account.profile.read',
  'account.profile.update',
  'account.sessions.read',
  'account.sessions.revoke',
  'account.tenant.select',
] as const satisfies readonly PermissionCode[];
const scopedOrganizationReadPermissions = [
  'organization.branches.read',
  'organization.departments.read',
  'organization.teams.read',
] as const satisfies readonly PermissionCode[];

const rolePermissions: Record<RoleCode, readonly PermissionCode[]> = {
  AGENCY_ADMIN: [
    ...accountPermissions,
    'organization.clients.read',
    'organization.branches.read',
    'organization.departments.read',
    'organization.teams.read',
    'organization.users.read',
    'organization.roles.read',
    'platform.agencies.manage',
    'platform.clients.manage',
    'platform.defaults.manage',
    'platform.support_elevation.manage',
    'organization.branches.manage',
    'organization.departments.manage',
    'organization.teams.manage',
    'organization.hierarchy.read',
    'organization.hierarchy.manage',
    'organization.settings.manage',
    'organization.audit.read',
    ...leadManagerPermissions,
    ...telephonyManagerPermissions,
    ...messagingManagerPermissions,
    ...testRideManagerPermissions,
    ...inventoryManagerPermissions,
    ...commercialManagerPermissions,
    ...deliveryManagerPermissions,
    ...registrationManagerPermissions,
    ...reminderManagerPermissions,
    ...reportingManagerPermissions,
  ],
  CLIENT_ADMIN: [
    ...accountPermissions,
    'organization.clients.read',
    ...scopedOrganizationReadPermissions,
    'organization.users.read',
    'organization.users.manage',
    'organization.roles.read',
    'organization.roles.manage',
    'organization.sessions.manage',
    'organization.branches.manage',
    'organization.departments.manage',
    'organization.teams.manage',
    'organization.hierarchy.read',
    'organization.hierarchy.manage',
    'organization.settings.manage',
    'organization.audit.read',
    ...leadManagerPermissions,
    ...telephonyManagerPermissions,
    ...messagingManagerPermissions,
    ...testRideManagerPermissions,
    ...inventoryManagerPermissions,
    ...commercialManagerPermissions,
    ...deliveryManagerPermissions,
    ...registrationManagerPermissions,
    ...reminderManagerPermissions,
    ...reportingManagerPermissions,
  ],
  MANAGER: [
    ...accountPermissions,
    'organization.clients.read',
    ...scopedOrganizationReadPermissions,
    'organization.users.read',
    'organization.roles.read',
    'organization.sessions.manage',
    'organization.hierarchy.read',
    'organization.hierarchy.manage',
    ...leadManagerPermissions,
    ...telephonyManagerPermissions,
    ...messagingManagerPermissions,
    ...testRideManagerPermissions,
    ...inventoryManagerPermissions,
    ...commercialManagerPermissions,
    ...deliveryManagerPermissions,
    ...registrationManagerPermissions,
    ...reminderManagerPermissions,
    ...reportingManagerPermissions,
  ],
  SALES_MANAGER: [
    ...accountPermissions,
    ...scopedOrganizationReadPermissions,
    'organization.users.read',
    'organization.roles.read',
    'organization.hierarchy.read',
    'organization.hierarchy.manage',
    ...leadManagerPermissions,
    ...telephonyManagerPermissions,
    ...messagingManagerPermissions,
    ...testRideManagerPermissions,
    ...inventoryReadPermissions,
    ...commercialManagerPermissions,
    ...deliveryManagerPermissions,
    ...registrationManagerPermissions,
    ...reminderManagerPermissions,
    ...reportingManagerPermissions,
  ],
  TELECALLER: [
    ...accountPermissions,
    ...scopedOrganizationReadPermissions,
    'leads.create',
    ...leadAgentPermissions,
    ...telephonyAgentPermissions,
    ...messagingAgentPermissions,
  ],
  SALESPERSON: [
    ...accountPermissions,
    ...scopedOrganizationReadPermissions,
    ...leadAgentPermissions,
    ...telephonyAgentPermissions,
    ...messagingAgentPermissions,
    ...testRideSalesPermissions,
    ...inventoryReadPermissions,
    ...commercialSalesPermissions,
    ...reminderOperatorPermissions,
  ],
  TEST_RIDE_EXECUTIVE: [
    ...accountPermissions,
    ...scopedOrganizationReadPermissions,
    ...testRideExecutivePermissions,
    ...inventoryReadPermissions,
  ],
  INVENTORY_EXECUTIVE: [
    ...accountPermissions,
    ...scopedOrganizationReadPermissions,
    ...inventoryOperatorPermissions,
    ...commercialReadPermissions,
    ...registrationReadPermissions,
  ],
  BILLING_DOCUMENTATION_EXECUTIVE: [
    ...accountPermissions,
    ...scopedOrganizationReadPermissions,
    ...inventoryReadPermissions,
    ...commercialBillingPermissions,
    ...registrationReadPermissions,
  ],
  DELIVERY_EXECUTIVE: [
    ...accountPermissions,
    ...scopedOrganizationReadPermissions,
    ...commercialReadPermissions,
    ...deliveryExecutivePermissions,
  ],
  RC_REGISTRATION_EXECUTIVE: [
    ...accountPermissions,
    ...scopedOrganizationReadPermissions,
    ...commercialReadPermissions,
    ...registrationExecutivePermissions,
    ...reminderOperatorPermissions,
  ],
  TEAM_MANAGER: [
    ...accountPermissions,
    ...scopedOrganizationReadPermissions,
    'organization.users.read',
    'organization.hierarchy.read',
    ...leadManagerPermissions,
    ...telephonyTeamManagerPermissions,
    ...messagingTeamManagerPermissions,
    ...testRideManagerPermissions,
    ...inventoryReadPermissions,
    ...commercialManagerPermissions,
    ...deliveryManagerPermissions,
    ...registrationManagerPermissions,
    ...reminderManagerPermissions,
    ...reportingManagerPermissions,
  ],
};

interface SeedUser {
  userId: string;
  identityId: string;
  membershipId: string;
  displayName: string;
  email: string;
  roleCode: RoleCode;
  contextType: 'AGENCY' | 'CLIENT';
  clientOrganizationId?: string;
  branchScopeMode: 'ALL' | 'SELECTED' | 'NONE';
  departmentScopeMode?: 'ALL' | 'SELECTED' | 'NONE';
  departmentScopes?: readonly { branchId: string; departmentId: string }[];
  jobTitle?: string;
  teamScopeMode: 'ALL' | 'SELECTED' | 'NONE';
  assignmentScope: 'ALL' | 'TEAM' | 'OWNED' | 'ASSIGNED' | 'OWNED_OR_ASSIGNED' | 'NONE';
  branchIds?: readonly string[];
  teamScopes?: readonly { branchId: string; teamId: string }[];
}

const seedUsers: readonly SeedUser[] = [
  {
    userId: '50000000-0000-4000-8000-000000000001',
    identityId: '70000000-0000-4000-8000-000000000001',
    membershipId: '60000000-0000-4000-8000-000000000001',
    displayName: 'Aarav Agency Admin',
    email: 'agency.admin@seed.godigital.test',
    roleCode: 'AGENCY_ADMIN',
    contextType: 'AGENCY',
    branchScopeMode: 'NONE',
    teamScopeMode: 'NONE',
    assignmentScope: 'NONE',
  },
  {
    userId: '50000000-0000-4000-8000-000000000002',
    identityId: '70000000-0000-4000-8000-000000000002',
    membershipId: '60000000-0000-4000-8000-000000000002',
    displayName: 'Diya Client Admin',
    email: 'client.admin@seed.godigital.test',
    roleCode: 'CLIENT_ADMIN',
    contextType: 'CLIENT',
    clientOrganizationId: ALPHA_CLIENT_ID,
    branchScopeMode: 'ALL',
    teamScopeMode: 'ALL',
    assignmentScope: 'ALL',
  },
  {
    userId: '50000000-0000-4000-8000-000000000003',
    identityId: '70000000-0000-4000-8000-000000000003',
    membershipId: '60000000-0000-4000-8000-000000000003',
    displayName: 'Kabir Manager',
    email: 'manager@seed.godigital.test',
    roleCode: 'MANAGER',
    contextType: 'CLIENT',
    clientOrganizationId: ALPHA_CLIENT_ID,
    branchScopeMode: 'ALL',
    teamScopeMode: 'ALL',
    assignmentScope: 'ALL',
  },
  {
    userId: '50000000-0000-4000-8000-000000000004',
    identityId: '70000000-0000-4000-8000-000000000004',
    membershipId: '60000000-0000-4000-8000-000000000004',
    displayName: 'Ishita Sales Manager',
    email: 'sales.manager@seed.godigital.test',
    roleCode: 'SALES_MANAGER',
    contextType: 'CLIENT',
    clientOrganizationId: ALPHA_CLIENT_ID,
    branchScopeMode: 'SELECTED',
    teamScopeMode: 'SELECTED',
    assignmentScope: 'TEAM',
    branchIds: [ALPHA_PUNE_BRANCH_ID],
    teamScopes: [{ branchId: ALPHA_PUNE_BRANCH_ID, teamId: ALPHA_PUNE_TEAM_ID }],
  },
  {
    userId: '50000000-0000-4000-8000-000000000005',
    identityId: '70000000-0000-4000-8000-000000000005',
    membershipId: '60000000-0000-4000-8000-000000000005',
    displayName: 'Meera Telecaller',
    email: 'telecaller@seed.godigital.test',
    roleCode: 'TELECALLER',
    contextType: 'CLIENT',
    clientOrganizationId: ALPHA_CLIENT_ID,
    branchScopeMode: 'SELECTED',
    teamScopeMode: 'SELECTED',
    assignmentScope: 'ASSIGNED',
    branchIds: [ALPHA_PUNE_BRANCH_ID],
    teamScopes: [{ branchId: ALPHA_PUNE_BRANCH_ID, teamId: ALPHA_PUNE_TEAM_ID }],
  },
  {
    userId: '50000000-0000-4000-8000-000000000006',
    identityId: '70000000-0000-4000-8000-000000000006',
    membershipId: '60000000-0000-4000-8000-000000000006',
    displayName: 'Arjun Salesperson',
    email: 'salesperson@seed.godigital.test',
    roleCode: 'SALESPERSON',
    contextType: 'CLIENT',
    clientOrganizationId: ALPHA_CLIENT_ID,
    branchScopeMode: 'SELECTED',
    teamScopeMode: 'SELECTED',
    assignmentScope: 'OWNED_OR_ASSIGNED',
    branchIds: [ALPHA_PUNE_BRANCH_ID],
    teamScopes: [{ branchId: ALPHA_PUNE_BRANCH_ID, teamId: ALPHA_PUNE_TEAM_ID }],
  },
  {
    userId: '50000000-0000-4000-8000-000000000007',
    identityId: '70000000-0000-4000-8000-000000000007',
    membershipId: '60000000-0000-4000-8000-000000000007',
    displayName: 'Riya Test Ride Executive',
    email: 'test.ride@seed.godigital.test',
    roleCode: 'TEST_RIDE_EXECUTIVE',
    contextType: 'CLIENT',
    clientOrganizationId: ALPHA_CLIENT_ID,
    branchScopeMode: 'SELECTED',
    teamScopeMode: 'NONE',
    assignmentScope: 'ASSIGNED',
    branchIds: [ALPHA_PUNE_BRANCH_ID],
  },
  {
    userId: '50000000-0000-4000-8000-000000000008',
    identityId: '70000000-0000-4000-8000-000000000008',
    membershipId: '60000000-0000-4000-8000-000000000008',
    displayName: 'Vivaan Inventory Executive',
    email: 'inventory@seed.godigital.test',
    roleCode: 'INVENTORY_EXECUTIVE',
    contextType: 'CLIENT',
    clientOrganizationId: ALPHA_CLIENT_ID,
    branchScopeMode: 'SELECTED',
    teamScopeMode: 'NONE',
    assignmentScope: 'ASSIGNED',
    branchIds: [ALPHA_PUNE_BRANCH_ID, ALPHA_MUMBAI_BRANCH_ID],
  },
  {
    userId: '50000000-0000-4000-8000-000000000009',
    identityId: '70000000-0000-4000-8000-000000000009',
    membershipId: '60000000-0000-4000-8000-000000000009',
    displayName: 'Anaya Billing Executive',
    email: 'billing@seed.godigital.test',
    roleCode: 'BILLING_DOCUMENTATION_EXECUTIVE',
    contextType: 'CLIENT',
    clientOrganizationId: ALPHA_CLIENT_ID,
    branchScopeMode: 'SELECTED',
    teamScopeMode: 'NONE',
    assignmentScope: 'ASSIGNED',
    branchIds: [ALPHA_MUMBAI_BRANCH_ID],
  },
  {
    userId: '50000000-0000-4000-8000-000000000010',
    identityId: '70000000-0000-4000-8000-000000000010',
    membershipId: '60000000-0000-4000-8000-000000000010',
    displayName: 'Advait Delivery Executive',
    email: 'delivery@seed.godigital.test',
    roleCode: 'DELIVERY_EXECUTIVE',
    contextType: 'CLIENT',
    clientOrganizationId: ALPHA_CLIENT_ID,
    branchScopeMode: 'SELECTED',
    teamScopeMode: 'NONE',
    assignmentScope: 'ASSIGNED',
    branchIds: [ALPHA_PUNE_BRANCH_ID],
  },
  {
    userId: '50000000-0000-4000-8000-000000000011',
    identityId: '70000000-0000-4000-8000-000000000011',
    membershipId: '60000000-0000-4000-8000-000000000011',
    displayName: 'Myra Registration Executive',
    email: 'registration@seed.godigital.test',
    roleCode: 'RC_REGISTRATION_EXECUTIVE',
    contextType: 'CLIENT',
    clientOrganizationId: ALPHA_CLIENT_ID,
    branchScopeMode: 'SELECTED',
    teamScopeMode: 'NONE',
    assignmentScope: 'ASSIGNED',
    branchIds: [ALPHA_MUMBAI_BRANCH_ID],
  },
  {
    userId: '50000000-0000-4000-8000-000000000012',
    identityId: '70000000-0000-4000-8000-000000000012',
    membershipId: '60000000-0000-4000-8000-000000000012',
    displayName: 'Reyansh Beta Client Admin',
    email: 'client.admin.beta@seed.godigital.test',
    roleCode: 'CLIENT_ADMIN',
    contextType: 'CLIENT',
    clientOrganizationId: BETA_CLIENT_ID,
    branchScopeMode: 'ALL',
    teamScopeMode: 'ALL',
    assignmentScope: 'ALL',
  },
  {
    userId: '50000000-0000-4000-8000-000000000013',
    identityId: '70000000-0000-4000-8000-000000000013',
    membershipId: '60000000-0000-4000-8000-000000000013',
    displayName: 'Nisha Team Manager',
    email: 'team.manager@seed.godigital.test',
    roleCode: 'TEAM_MANAGER',
    contextType: 'CLIENT',
    clientOrganizationId: ALPHA_CLIENT_ID,
    branchScopeMode: 'SELECTED',
    departmentScopeMode: 'SELECTED',
    departmentScopes: [{ branchId: ALPHA_PUNE_BRANCH_ID, departmentId: ALPHA_PUNE_DEPARTMENT_ID }],
    jobTitle: 'Team Manager',
    teamScopeMode: 'SELECTED',
    assignmentScope: 'TEAM',
    branchIds: [ALPHA_PUNE_BRANCH_ID],
    teamScopes: [{ branchId: ALPHA_PUNE_BRANCH_ID, teamId: ALPHA_PUNE_TEAM_ID }],
  },
];

const defaultJobTitleByRole: Partial<Record<RoleCode, string>> = {
  CLIENT_ADMIN: 'CRM Admin',
  MANAGER: 'Business Owner',
  SALES_MANAGER: 'Showroom Manager',
  TEAM_MANAGER: 'Team Manager',
  TELECALLER: 'Telecaller',
  SALESPERSON: 'Sales Consultant',
  TEST_RIDE_EXECUTIVE: 'Test Ride Executive',
  INVENTORY_EXECUTIVE: 'Stock / Inventory Team',
  BILLING_DOCUMENTATION_EXECUTIVE: 'Finance / Documentation Team',
  DELIVERY_EXECUTIVE: 'Delivery Coordinator',
  RC_REGISTRATION_EXECUTIVE: 'RTO Team',
};

const departmentByBranch: Record<string, string> = {
  [ALPHA_PUNE_BRANCH_ID]: ALPHA_PUNE_DEPARTMENT_ID,
  [ALPHA_MUMBAI_BRANCH_ID]: ALPHA_MUMBAI_DEPARTMENT_ID,
  [BETA_NASHIK_BRANCH_ID]: BETA_NASHIK_DEPARTMENT_ID,
};

function derivePassword(password: string, pepper: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      `${password}\u0000${pepper}`,
      salt,
      SCRYPT_KEY_LENGTH,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 64 * 1024 * 1024 },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(derivedKey);
      },
    );
  });
}

async function seed(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Development seed data must never be written in production.');
  }

  const databaseUrl = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DIRECT_DATABASE_URL or DATABASE_URL is required to seed development data.');
  }

  const credentials = await Promise.all(
    seedUsers.map(async (user) => {
      const salt = createHash('sha256')
        .update(`go-digital-development-seed:${user.email}`)
        .digest()
        .subarray(0, 16);
      const digest = await derivePassword(
        DEVELOPMENT_SEED_PASSWORD,
        DEVELOPMENT_PASSWORD_PEPPER,
        salt,
      );

      return { user, salt: salt.toString('hex'), digest: digest.toString('hex') };
    }),
  );

  const connection = createDatabaseConnection({ url: databaseUrl, maxConnections: 1 });

  try {
    await connection.db.transaction(async (transaction) => {
      await transaction
        .insert(agencies)
        .values({
          id: AGENCY_ID,
          code: 'GO_DIGITAL',
          legalName: 'Go Digital Marketing',
          displayName: 'Go Digital Marketing',
          status: 'ACTIVE',
          createdAt: SEED_DATE,
          updatedAt: SEED_DATE,
        })
        .onConflictDoUpdate({
          target: agencies.id,
          set: {
            legalName: 'Go Digital Marketing',
            displayName: 'Go Digital Marketing',
            status: 'ACTIVE',
            updatedAt: SEED_DATE,
          },
        });

      for (const client of [
        {
          id: ALPHA_CLIENT_ID,
          code: 'SUNRISE_MOTORS',
          legalName: 'Sunrise Motors Private Limited',
          displayName: 'Sunrise Motors',
        },
        {
          id: BETA_CLIENT_ID,
          code: 'HERITAGE_AUTO',
          legalName: 'Heritage Auto Private Limited',
          displayName: 'Heritage Auto',
        },
      ]) {
        await transaction
          .insert(clientOrganizations)
          .values({
            ...client,
            agencyId: AGENCY_ID,
            status: 'ACTIVE',
            timezone: 'Asia/Kolkata',
            settingsVersion: 1,
            createdAt: SEED_DATE,
            updatedAt: SEED_DATE,
          })
          .onConflictDoUpdate({
            target: clientOrganizations.id,
            set: {
              legalName: client.legalName,
              displayName: client.displayName,
              status: 'ACTIVE',
              updatedAt: SEED_DATE,
            },
          });
      }

      for (const branch of [
        {
          id: ALPHA_PUNE_BRANCH_ID,
          clientOrganizationId: ALPHA_CLIENT_ID,
          code: 'PUNE_CENTRAL',
          name: 'Pune Central',
        },
        {
          id: ALPHA_MUMBAI_BRANCH_ID,
          clientOrganizationId: ALPHA_CLIENT_ID,
          code: 'MUMBAI_WEST',
          name: 'Mumbai West',
        },
        {
          id: BETA_NASHIK_BRANCH_ID,
          clientOrganizationId: BETA_CLIENT_ID,
          code: 'NASHIK_MAIN',
          name: 'Nashik Main',
        },
      ]) {
        await transaction
          .insert(branches)
          .values({
            ...branch,
            timezone: 'Asia/Kolkata',
            active: true,
            createdAt: SEED_DATE,
            updatedAt: SEED_DATE,
          })
          .onConflictDoUpdate({
            target: branches.id,
            set: { name: branch.name, active: true, updatedAt: SEED_DATE },
          });
      }

      for (const department of [
        {
          id: ALPHA_PUNE_DEPARTMENT_ID,
          clientOrganizationId: ALPHA_CLIENT_ID,
          branchId: ALPHA_PUNE_BRANCH_ID,
          code: 'PUNE_SALES',
          name: 'Sales',
        },
        {
          id: ALPHA_MUMBAI_DEPARTMENT_ID,
          clientOrganizationId: ALPHA_CLIENT_ID,
          branchId: ALPHA_MUMBAI_BRANCH_ID,
          code: 'MUMBAI_OPERATIONS',
          name: 'Operations',
        },
        {
          id: BETA_NASHIK_DEPARTMENT_ID,
          clientOrganizationId: BETA_CLIENT_ID,
          branchId: BETA_NASHIK_BRANCH_ID,
          code: 'NASHIK_SALES',
          name: 'Sales',
        },
      ]) {
        await transaction
          .insert(departments)
          .values({ ...department, active: true, createdAt: SEED_DATE, updatedAt: SEED_DATE })
          .onConflictDoUpdate({
            target: departments.id,
            set: { active: true, name: department.name, updatedAt: SEED_DATE },
          });
      }

      for (const team of [
        {
          id: ALPHA_PUNE_TEAM_ID,
          clientOrganizationId: ALPHA_CLIENT_ID,
          branchId: ALPHA_PUNE_BRANCH_ID,
          departmentId: ALPHA_PUNE_DEPARTMENT_ID,
          code: 'PUNE_SALES',
          name: 'Pune Sales',
        },
        {
          id: ALPHA_MUMBAI_TEAM_ID,
          clientOrganizationId: ALPHA_CLIENT_ID,
          branchId: ALPHA_MUMBAI_BRANCH_ID,
          departmentId: ALPHA_MUMBAI_DEPARTMENT_ID,
          code: 'MUMBAI_SALES',
          name: 'Mumbai Sales',
        },
        {
          id: BETA_NASHIK_TEAM_ID,
          clientOrganizationId: BETA_CLIENT_ID,
          branchId: BETA_NASHIK_BRANCH_ID,
          departmentId: BETA_NASHIK_DEPARTMENT_ID,
          code: 'NASHIK_SALES',
          name: 'Nashik Sales',
        },
      ]) {
        await transaction
          .insert(teams)
          .values({ ...team, active: true, createdAt: SEED_DATE, updatedAt: SEED_DATE })
          .onConflictDoUpdate({
            target: teams.id,
            set: { name: team.name, active: true, updatedAt: SEED_DATE },
          });
      }

      await transaction
        .insert(agencyDefaults)
        .values({
          agencyId: AGENCY_ID,
          defaultTimezone: 'Asia/Kolkata',
          defaultFeatureFlags: { INBOX: false, LEADS: true, TELEPHONY: false },
          updatedAt: SEED_DATE,
        })
        .onConflictDoUpdate({
          target: agencyDefaults.agencyId,
          set: {
            defaultTimezone: 'Asia/Kolkata',
            defaultFeatureFlags: { INBOX: false, LEADS: true, TELEPHONY: false },
            updatedAt: SEED_DATE,
          },
        });
      for (const clientOrganizationId of [ALPHA_CLIENT_ID, BETA_CLIENT_ID]) {
        await transaction
          .insert(clientAdministrationSettings)
          .values({
            clientOrganizationId,
            leadAssignmentReady: clientOrganizationId === ALPHA_CLIENT_ID,
            retentionPolicy: { audit_log_days: 365, export_days: 30, recording_days: 180 },
            updatedAt: SEED_DATE,
          })
          .onConflictDoUpdate({
            target: clientAdministrationSettings.clientOrganizationId,
            set: {
              leadAssignmentReady: clientOrganizationId === ALPHA_CLIENT_ID,
              retentionPolicy: { audit_log_days: 365, export_days: 30, recording_days: 180 },
              updatedAt: SEED_DATE,
            },
          });
        for (const module of [
          'LEADS',
          'TELEPHONY',
          'INBOX',
          'TEST_RIDES',
          'INVENTORY',
          'BOOKING_BILLING',
          'DELIVERY_RC',
          'POST_SALE',
          'INTEGRATIONS',
        ]) {
          const enabled =
            module === 'LEADS' ||
            (clientOrganizationId === ALPHA_CLIENT_ID &&
              (module === 'TELEPHONY' ||
                module === 'INBOX' ||
                module === 'TEST_RIDES' ||
                module === 'INVENTORY' ||
                module === 'BOOKING_BILLING' ||
                module === 'DELIVERY_RC'));
          await transaction
            .insert(clientModuleFlags)
            .values({
              clientOrganizationId,
              module,
              enabled,
              reason: enabled ? 'Development seed default' : 'Not enabled in development seed',
              updatedAt: SEED_DATE,
            })
            .onConflictDoUpdate({
              target: [clientModuleFlags.clientOrganizationId, clientModuleFlags.module],
              set: {
                enabled,
                reason: enabled ? 'Development seed default' : 'Not enabled in development seed',
                updatedAt: SEED_DATE,
              },
            });
        }
        for (const integration of [
          'WHATSAPP',
          'TELEPHONY',
          'META_LEADS',
          'GOOGLE_BUSINESS',
          'GOOGLE_ADS',
          'EMAIL',
          'SMS',
        ]) {
          await transaction
            .insert(clientIntegrationReadiness)
            .values({
              clientOrganizationId,
              integration,
              status: 'NOT_CONNECTED',
              detail: 'Development placeholder',
              updatedAt: SEED_DATE,
            })
            .onConflictDoUpdate({
              target: [
                clientIntegrationReadiness.clientOrganizationId,
                clientIntegrationReadiness.integration,
              ],
              set: {
                status: 'NOT_CONNECTED',
                detail: 'Development placeholder',
                updatedAt: SEED_DATE,
              },
            });
        }
      }
      for (const branch of [
        { id: ALPHA_PUNE_BRANCH_ID, clientOrganizationId: ALPHA_CLIENT_ID },
        { id: ALPHA_MUMBAI_BRANCH_ID, clientOrganizationId: ALPHA_CLIENT_ID },
        { id: BETA_NASHIK_BRANCH_ID, clientOrganizationId: BETA_CLIENT_ID },
      ]) {
        for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
          await transaction
            .insert(branchWorkingHours)
            .values({
              clientOrganizationId: branch.clientOrganizationId,
              branchId: branch.id,
              dayOfWeek,
              isClosed: dayOfWeek === 0,
              ...(dayOfWeek === 0 ? {} : { opensAt: '09:30:00', closesAt: '18:30:00' }),
              updatedAt: SEED_DATE,
            })
            .onConflictDoUpdate({
              target: [branchWorkingHours.branchId, branchWorkingHours.dayOfWeek],
              set: {
                isClosed: dayOfWeek === 0,
                opensAt: dayOfWeek === 0 ? null : '09:30:00',
                closesAt: dayOfWeek === 0 ? null : '18:30:00',
                updatedAt: SEED_DATE,
              },
            });
        }
      }

      for (const role of roleDefinitions) {
        const [resolvedRole] = await transaction
          .insert(roles)
          .values({
            id: roleIdByCode[role.code],
            ...role,
            active: true,
            createdAt: SEED_DATE,
          })
          .onConflictDoUpdate({
            target: roles.code,
            set: {
              displayName: role.displayName,
              description: role.description,
              application: role.application,
              active: true,
            },
          })
          .returning({ id: roles.id });

        if (!resolvedRole) throw new Error(`Could not resolve seeded role ${role.code}.`);
        roleIdByCode[role.code] = resolvedRole.id;
      }

      for (const code of PERMISSION_CODES) {
        const [resolvedPermission] = await transaction
          .insert(permissions)
          .values({
            id: permissionIdByCode[code],
            code,
            description: permissionDescriptions[code],
            createdAt: SEED_DATE,
          })
          .onConflictDoUpdate({
            target: permissions.code,
            set: { description: permissionDescriptions[code] },
          })
          .returning({ id: permissions.id });

        if (!resolvedPermission) throw new Error(`Could not resolve seeded permission ${code}.`);
        permissionIdByCode[code] = resolvedPermission.id;
      }

      for (const roleCode of CANONICAL_ROLE_CODES) {
        for (const permissionCode of rolePermissions[roleCode]) {
          await transaction
            .insert(rolePermissionMappings)
            .values({
              roleId: roleIdByCode[roleCode],
              permissionId: permissionIdByCode[permissionCode],
              createdAt: SEED_DATE,
            })
            .onConflictDoNothing();
        }
      }

      for (const { user, salt, digest } of credentials) {
        await transaction
          .insert(users)
          .values({
            id: user.userId,
            displayName: user.displayName,
            primaryEmailNormalized: user.email,
            status: 'ACTIVE',
            createdAt: SEED_DATE,
            updatedAt: SEED_DATE,
          })
          .onConflictDoUpdate({
            target: users.id,
            set: {
              displayName: user.displayName,
              primaryEmailNormalized: user.email,
              status: 'ACTIVE',
              updatedAt: SEED_DATE,
              suspendedAt: null,
              deactivatedAt: null,
            },
          });

        await transaction
          .insert(authenticationIdentities)
          .values({
            id: user.identityId,
            userId: user.userId,
            provider: 'PASSWORD',
            providerKey: 'LOCAL',
            subjectNormalized: user.email,
            status: 'ACTIVE',
            passwordDigest: digest,
            passwordSalt: salt,
            passwordScryptN: SCRYPT_N,
            passwordScryptR: SCRYPT_R,
            passwordScryptP: SCRYPT_P,
            passwordKeyLength: SCRYPT_KEY_LENGTH,
            failedAttemptCount: 0,
            lockedUntil: null,
            verifiedAt: SEED_DATE,
            createdAt: SEED_DATE,
            updatedAt: SEED_DATE,
          })
          .onConflictDoUpdate({
            target: authenticationIdentities.id,
            set: {
              status: 'ACTIVE',
              passwordDigest: digest,
              passwordSalt: salt,
              passwordScryptN: SCRYPT_N,
              passwordScryptR: SCRYPT_R,
              passwordScryptP: SCRYPT_P,
              passwordKeyLength: SCRYPT_KEY_LENGTH,
              failedAttemptCount: 0,
              lockedUntil: null,
              updatedAt: SEED_DATE,
            },
          });

        await transaction
          .insert(memberships)
          .values({
            id: user.membershipId,
            userId: user.userId,
            contextType: user.contextType,
            agencyId: user.contextType === 'AGENCY' ? AGENCY_ID : null,
            clientOrganizationId: user.clientOrganizationId ?? null,
            roleId: roleIdByCode[user.roleCode],
            status: 'ACTIVE',
            branchScopeMode: user.branchScopeMode,
            departmentScopeMode:
              user.departmentScopeMode ??
              (user.contextType === 'AGENCY'
                ? 'NONE'
                : user.branchScopeMode === 'ALL'
                  ? 'ALL'
                  : 'SELECTED'),
            jobTitle: user.jobTitle ?? defaultJobTitleByRole[user.roleCode] ?? null,
            teamScopeMode: user.teamScopeMode,
            assignmentScope: user.assignmentScope,
            effectiveFrom: SEED_DATE,
            createdAt: SEED_DATE,
            updatedAt: SEED_DATE,
          })
          .onConflictDoUpdate({
            target: memberships.id,
            set: {
              roleId: roleIdByCode[user.roleCode],
              status: 'ACTIVE',
              branchScopeMode: user.branchScopeMode,
              departmentScopeMode:
                user.departmentScopeMode ??
                (user.contextType === 'AGENCY'
                  ? 'NONE'
                  : user.branchScopeMode === 'ALL'
                    ? 'ALL'
                    : 'SELECTED'),
              jobTitle: user.jobTitle ?? defaultJobTitleByRole[user.roleCode] ?? null,
              teamScopeMode: user.teamScopeMode,
              assignmentScope: user.assignmentScope,
              effectiveUntil: null,
              updatedAt: SEED_DATE,
            },
          });

        if (user.clientOrganizationId) {
          await transaction
            .delete(membershipBranchScopes)
            .where(sql`${membershipBranchScopes.membershipId} = ${user.membershipId}`);
          await transaction
            .delete(membershipDepartmentScopes)
            .where(sql`${membershipDepartmentScopes.membershipId} = ${user.membershipId}`);
          await transaction
            .delete(membershipTeamScopes)
            .where(sql`${membershipTeamScopes.membershipId} = ${user.membershipId}`);

          if (user.branchScopeMode === 'SELECTED' && user.branchIds) {
            await transaction.insert(membershipBranchScopes).values(
              user.branchIds.map((branchId) => ({
                clientOrganizationId: user.clientOrganizationId as string,
                membershipId: user.membershipId,
                branchId,
                createdAt: SEED_DATE,
              })),
            );
          }

          if (user.teamScopeMode === 'SELECTED' && user.teamScopes) {
            await transaction.insert(membershipTeamScopes).values(
              user.teamScopes.map((teamScope) => ({
                clientOrganizationId: user.clientOrganizationId as string,
                membershipId: user.membershipId,
                branchId: teamScope.branchId,
                teamId: teamScope.teamId,
                createdAt: SEED_DATE,
              })),
            );
          }

          const departmentScopes =
            user.departmentScopes ??
            (user.branchIds ?? []).flatMap((branchId) => {
              const departmentId = departmentByBranch[branchId];
              return departmentId ? [{ branchId, departmentId }] : [];
            });
          if (
            (user.departmentScopeMode ?? (user.branchScopeMode === 'ALL' ? 'ALL' : 'SELECTED')) ===
              'SELECTED' &&
            departmentScopes.length > 0
          )
            await transaction.insert(membershipDepartmentScopes).values(
              departmentScopes.map((scope) => ({
                branchId: scope.branchId,
                clientOrganizationId: user.clientOrganizationId as string,
                createdAt: SEED_DATE,
                departmentId: scope.departmentId,
                membershipId: user.membershipId,
              })),
            );
        }
      }

      await transaction
        .insert(teamMemberships)
        .values([
          {
            id: '62000000-0000-4000-8000-000000000001',
            assignedBy: '50000000-0000-4000-8000-000000000002',
            branchId: ALPHA_PUNE_BRANCH_ID,
            clientOrganizationId: ALPHA_CLIENT_ID,
            departmentId: ALPHA_PUNE_DEPARTMENT_ID,
            membershipId: '60000000-0000-4000-8000-000000000005',
            reason: 'Development seed sales-team membership.',
            startedAt: SEED_DATE,
            teamId: ALPHA_PUNE_TEAM_ID,
          },
          {
            id: '62000000-0000-4000-8000-000000000002',
            assignedBy: '50000000-0000-4000-8000-000000000002',
            branchId: ALPHA_PUNE_BRANCH_ID,
            clientOrganizationId: ALPHA_CLIENT_ID,
            departmentId: ALPHA_PUNE_DEPARTMENT_ID,
            membershipId: '60000000-0000-4000-8000-000000000006',
            reason: 'Development seed sales-team membership.',
            startedAt: SEED_DATE,
            teamId: ALPHA_PUNE_TEAM_ID,
          },
        ])
        .onConflictDoNothing();
      await transaction
        .insert(teamManagerAssignments)
        .values({
          id: '63000000-0000-4000-8000-000000000001',
          assignedBy: '50000000-0000-4000-8000-000000000002',
          branchId: ALPHA_PUNE_BRANCH_ID,
          clientOrganizationId: ALPHA_CLIENT_ID,
          departmentId: ALPHA_PUNE_DEPARTMENT_ID,
          managerMembershipId: '60000000-0000-4000-8000-000000000013',
          reason: 'Development seed canonical Team Manager.',
          startedAt: SEED_DATE,
          teamId: ALPHA_PUNE_TEAM_ID,
        })
        .onConflictDoNothing();
      await transaction
        .insert(reportingLines)
        .values([
          {
            id: '64000000-0000-4000-8000-000000000001',
            assignedBy: '50000000-0000-4000-8000-000000000002',
            clientOrganizationId: ALPHA_CLIENT_ID,
            managerMembershipId: '60000000-0000-4000-8000-000000000013',
            reason: 'Development seed reporting hierarchy.',
            startedAt: SEED_DATE,
            subordinateMembershipId: '60000000-0000-4000-8000-000000000005',
          },
          {
            id: '64000000-0000-4000-8000-000000000002',
            assignedBy: '50000000-0000-4000-8000-000000000002',
            clientOrganizationId: ALPHA_CLIENT_ID,
            managerMembershipId: '60000000-0000-4000-8000-000000000013',
            reason: 'Development seed reporting hierarchy.',
            startedAt: SEED_DATE,
            subordinateMembershipId: '60000000-0000-4000-8000-000000000006',
          },
        ])
        .onConflictDoNothing();

      const alphaQueueId = '81000000-0000-4000-8000-000000000001';
      await transaction
        .insert(leadSettings)
        .values({
          clientOrganizationId: ALPHA_CLIENT_ID,
          firstActionSlaMinutes: 15,
          warningBeforeMinutes: 5,
          updatedAt: SEED_DATE,
          updatedBy: '50000000-0000-4000-8000-000000000002',
        })
        .onConflictDoUpdate({
          target: leadSettings.clientOrganizationId,
          set: { firstActionSlaMinutes: 15, warningBeforeMinutes: 5, updatedAt: SEED_DATE },
        });
      await transaction
        .insert(assignmentQueues)
        .values({
          id: alphaQueueId,
          active: true,
          branchId: ALPHA_PUNE_BRANCH_ID,
          clientOrganizationId: ALPHA_CLIENT_ID,
          code: 'PUNE-INBOUND',
          languageRules: ['English', 'Hindi', 'Marathi'],
          name: 'Pune inbound leads',
          sourceRules: [],
          strategy: 'ROUND_ROBIN',
          teamId: ALPHA_PUNE_TEAM_ID,
        })
        .onConflictDoUpdate({
          target: assignmentQueues.id,
          set: { active: true, strategy: 'ROUND_ROBIN', updatedAt: SEED_DATE },
        });
      for (const membershipId of [
        '60000000-0000-4000-8000-000000000005',
        '60000000-0000-4000-8000-000000000006',
      ]) {
        await transaction
          .insert(assignmentQueueMembers)
          .values({
            active: true,
            clientOrganizationId: ALPHA_CLIENT_ID,
            membershipId,
            queueId: alphaQueueId,
          })
          .onConflictDoUpdate({
            target: [assignmentQueueMembers.queueId, assignmentQueueMembers.membershipId],
            set: { active: true },
          });
      }
      await transaction
        .insert(publicLeadForms)
        .values({
          assignmentQueueId: alphaQueueId,
          branchId: ALPHA_PUNE_BRANCH_ID,
          clientFormKey: 'alpha-pune-website',
          clientOrganizationId: ALPHA_CLIENT_ID,
          consentNoticeVersion: 'lead-response-v1',
          name: 'Alpha Pune website enquiry',
        })
        .onConflictDoUpdate({
          target: publicLeadForms.clientFormKey,
          set: { active: true, assignmentQueueId: alphaQueueId, updatedAt: SEED_DATE },
        });
      await transaction
        .insert(inventoryBrands)
        .values({
          clientOrganizationId: ALPHA_CLIENT_ID,
          code: 'GDM-EV',
          createdAt: SEED_DATE,
          id: ALPHA_INVENTORY_BRAND_ID,
          name: 'Go Digital Electric',
          updatedAt: SEED_DATE,
        })
        .onConflictDoUpdate({
          target: inventoryBrands.id,
          set: { active: true, name: 'Go Digital Electric', updatedAt: SEED_DATE },
        });
      await transaction
        .insert(inventoryModels)
        .values({
          brandId: ALPHA_INVENTORY_BRAND_ID,
          clientOrganizationId: ALPHA_CLIENT_ID,
          code: 'EV-ZX',
          createdAt: SEED_DATE,
          id: ALPHA_INVENTORY_MODEL_ID,
          name: 'EV ZX',
          updatedAt: SEED_DATE,
        })
        .onConflictDoUpdate({
          target: inventoryModels.id,
          set: { active: true, name: 'EV ZX', updatedAt: SEED_DATE },
        });
      await transaction
        .insert(inventoryVariants)
        .values({
          clientOrganizationId: ALPHA_CLIENT_ID,
          code: 'EV-ZX-LR',
          createdAt: SEED_DATE,
          fuelPowertrain: 'BATTERY_ELECTRIC',
          id: ALPHA_INVENTORY_VARIANT_ID,
          modelId: ALPHA_INVENTORY_MODEL_ID,
          modelYear: 2026,
          name: 'Long Range',
          updatedAt: SEED_DATE,
        })
        .onConflictDoUpdate({
          target: inventoryVariants.id,
          set: { active: true, name: 'Long Range', updatedAt: SEED_DATE },
        });
      await transaction
        .insert(inventoryColours)
        .values({
          clientOrganizationId: ALPHA_CLIENT_ID,
          code: 'ARCTIC-WHITE',
          createdAt: SEED_DATE,
          id: ALPHA_INVENTORY_COLOUR_ID,
          name: 'Arctic White',
          updatedAt: SEED_DATE,
        })
        .onConflictDoUpdate({
          target: inventoryColours.id,
          set: { active: true, name: 'Arctic White', updatedAt: SEED_DATE },
        });
      await transaction
        .insert(inventoryUnits)
        .values({
          acquisitionReference: 'DEMO-FLEET-2026-01',
          branchId: ALPHA_PUNE_BRANCH_ID,
          chassisNumber: 'GDMZXDEMOCHASSIS01',
          clientOrganizationId: ALPHA_CLIENT_ID,
          colourId: ALPHA_INVENTORY_COLOUR_ID,
          conditionNotes: 'Development-only canonical demo unit.',
          createdAt: SEED_DATE,
          createdByMembershipId: '60000000-0000-4000-8000-000000000008',
          createdByUserId: '50000000-0000-4000-8000-000000000008',
          currentOdometerKm: 120,
          engineNumber: 'GDMZXDEMOMOTOR01',
          id: ALPHA_DEMO_INVENTORY_UNIT_ID,
          ownershipType: 'DEALER_OWNED',
          receivedAt: SEED_DATE,
          status: 'DEMO',
          unitReference: 'DEMO-EV-ZX-01',
          updatedAt: SEED_DATE,
          variantId: ALPHA_INVENTORY_VARIANT_ID,
          vin: 'GDMZXDEMO00000001',
        })
        .onConflictDoNothing();
      await transaction
        .insert(inventoryUnitStatusHistory)
        .values({
          actorMembershipId: '60000000-0000-4000-8000-000000000008',
          actorUserId: '50000000-0000-4000-8000-000000000008',
          clientOrganizationId: ALPHA_CLIENT_ID,
          createdAt: SEED_DATE,
          eventType: 'UNIT_CREATED',
          evidence: { development_fixture: true },
          id: ALPHA_DEMO_INVENTORY_HISTORY_ID,
          inventoryUnitId: ALPHA_DEMO_INVENTORY_UNIT_ID,
          reason: 'Development seed canonical demo.',
          toStatus: 'DEMO',
        })
        .onConflictDoNothing();
      await transaction
        .insert(inventoryUnits)
        .values({
          acquisitionReference: 'SALE-STOCK-2026-01',
          branchId: ALPHA_PUNE_BRANCH_ID,
          chassisNumber: 'GDMZXSALECHASSIS01',
          clientOrganizationId: ALPHA_CLIENT_ID,
          colourId: ALPHA_INVENTORY_COLOUR_ID,
          conditionNotes: 'Development-only allocated customer unit.',
          createdAt: SEED_DATE,
          createdByMembershipId: '60000000-0000-4000-8000-000000000003',
          createdByUserId: '50000000-0000-4000-8000-000000000003',
          currentOdometerKm: 8,
          engineNumber: 'GDMZXSALEMOTOR01',
          id: ALPHA_DELIVERY_INVENTORY_UNIT_ID,
          ownershipType: 'DEALER_OWNED',
          receivedAt: SEED_DATE,
          status: 'ALLOCATED',
          unitReference: 'STOCK-EV-ZX-DELIVERY-01',
          updatedAt: SEED_DATE,
          variantId: ALPHA_INVENTORY_VARIANT_ID,
          vin: 'GDMZXSALE00000001',
        })
        .onConflictDoNothing();
      await transaction
        .insert(inventoryUnitStatusHistory)
        .values({
          actorMembershipId: '60000000-0000-4000-8000-000000000003',
          actorUserId: '50000000-0000-4000-8000-000000000003',
          clientOrganizationId: ALPHA_CLIENT_ID,
          createdAt: SEED_DATE,
          eventType: 'UNIT_ALLOCATED',
          evidence: { development_fixture: true },
          id: ALPHA_DELIVERY_INVENTORY_HISTORY_ID,
          inventoryUnitId: ALPHA_DELIVERY_INVENTORY_UNIT_ID,
          reason: 'Development delivery fixture.',
          toStatus: 'ALLOCATED',
        })
        .onConflictDoNothing();
      await transaction
        .insert(contacts)
        .values({
          clientOrganizationId: ALPHA_CLIENT_ID,
          createdAt: SEED_DATE,
          displayName: 'Ananya Test Ride Customer',
          id: ALPHA_TEST_RIDE_CONTACT_ID,
          primaryEmailNormalized: 'ananya.customer@seed.godigital.test',
          primaryPhoneE164: '+919999000090',
          primaryPhoneLookupHash: createHash('sha256').update('+919999000090').digest('hex'),
          updatedAt: SEED_DATE,
        })
        .onConflictDoUpdate({
          target: contacts.id,
          set: { displayName: 'Ananya Test Ride Customer', updatedAt: SEED_DATE },
        });
      await transaction
        .insert(leadOpportunities)
        .values({
          assignmentQueueId: alphaQueueId,
          branchId: ALPHA_PUNE_BRANCH_ID,
          capturedAt: SEED_DATE,
          clientOrganizationId: ALPHA_CLIENT_ID,
          contactId: ALPHA_TEST_RIDE_CONTACT_ID,
          currentProcessOwnerId: '50000000-0000-4000-8000-000000000006',
          currentProcessOwnerMembershipId: '60000000-0000-4000-8000-000000000006',
          entryMethod: 'MANUAL',
          id: ALPHA_TEST_RIDE_LEAD_ID,
          relationshipOwnerId: '50000000-0000-4000-8000-000000000006',
          relationshipOwnerMembershipId: '60000000-0000-4000-8000-000000000006',
          slaDueAt: new Date('2026-08-01T00:15:00.000Z'),
          slaState: 'MET',
          slaWarningAt: new Date('2026-08-01T00:10:00.000Z'),
          source: 'WALK_IN',
          status: 'TEST_RIDE_BOOKED',
          updatedAt: SEED_DATE,
          vehicleInterest: 'Demo EV ZX',
        })
        .onConflictDoUpdate({
          target: leadOpportunities.id,
          set: { status: 'TEST_RIDE_BOOKED', updatedAt: SEED_DATE },
        });
      await transaction
        .insert(commercialSettings)
        .values({
          clientOrganizationId: ALPHA_CLIENT_ID,
          currency: 'INR',
          deliveryPaymentGateBasisPoints: 5_000,
          discountApprovalThresholdMinor: 100_000,
          effectiveAt: SEED_DATE,
          requireFinanceDisbursement: true,
          requireInsurance: true,
          requireInvoice: true,
          requiredDocumentTypes: ['BOOKING_FORM', 'IDENTITY_PROOF', 'ADDRESS_PROOF'],
          updatedAt: SEED_DATE,
          updatedByMembershipId: '60000000-0000-4000-8000-000000000003',
        })
        .onConflictDoUpdate({
          target: commercialSettings.clientOrganizationId,
          set: {
            deliveryPaymentGateBasisPoints: 5_000,
            discountApprovalThresholdMinor: 100_000,
            requiredDocumentTypes: ['BOOKING_FORM', 'IDENTITY_PROOF', 'ADDRESS_PROOF'],
            updatedAt: SEED_DATE,
          },
        });
      await transaction
        .insert(quotations)
        .values({
          approvalStatus: 'NOT_REQUIRED',
          branchId: ALPHA_PUNE_BRANCH_ID,
          clientOrganizationId: ALPHA_CLIENT_ID,
          contactId: ALPHA_TEST_RIDE_CONTACT_ID,
          createdAt: SEED_DATE,
          createdByMembershipId: '60000000-0000-4000-8000-000000000006',
          createdByUserId: '50000000-0000-4000-8000-000000000006',
          currency: 'INR',
          currentVersion: 1,
          discountMinor: 50_000,
          expiresAt: new Date('2026-09-01T00:00:00.000Z'),
          id: ALPHA_COMMERCIAL_QUOTATION_ID,
          leadId: ALPHA_TEST_RIDE_LEAD_ID,
          payableMinor: 2_950_000,
          quotationReference: 'QT-DEV-2026-0001',
          status: 'ACTIVE',
          totalMinor: 3_000_000,
          updatedAt: SEED_DATE,
          vehicleConfiguration: 'Demo EV ZX / Arctic White / Development fixture',
        })
        .onConflictDoUpdate({
          target: quotations.id,
          set: { status: 'ACTIVE', updatedAt: SEED_DATE },
        });
      await transaction
        .insert(quotationVersions)
        .values({
          clientOrganizationId: ALPHA_CLIENT_ID,
          createdAt: SEED_DATE,
          createdByMembershipId: '60000000-0000-4000-8000-000000000006',
          createdByUserId: '50000000-0000-4000-8000-000000000006',
          currency: 'INR',
          discountMinor: 50_000,
          expiresAt: new Date('2026-09-01T00:00:00.000Z'),
          id: ALPHA_COMMERCIAL_QUOTATION_VERSION_ID,
          notes: 'Development fixture quotation.',
          payableMinor: 2_950_000,
          quotationId: ALPHA_COMMERCIAL_QUOTATION_ID,
          reason: 'Initial quotation',
          totalMinor: 3_000_000,
          vehicleConfiguration: 'Demo EV ZX / Arctic White / Development fixture',
          version: 1,
        })
        .onConflictDoNothing();
      for (const component of [
        {
          amountMinor: 2_800_000,
          category: 'EX_SHOWROOM',
          code: 'EX_SHOWROOM',
          label: 'Ex-showroom price',
        },
        { amountMinor: 200_000, category: 'RTO', code: 'RTO', label: 'Registration and road tax' },
        {
          amountMinor: 50_000,
          category: 'DISCOUNT',
          code: 'DISCOUNT',
          label: 'Approved development discount',
        },
      ]) {
        await transaction
          .insert(quotationPriceComponents)
          .values({
            ...component,
            clientOrganizationId: ALPHA_CLIENT_ID,
            quotationVersionId: ALPHA_COMMERCIAL_QUOTATION_VERSION_ID,
          })
          .onConflictDoNothing();
      }
      await transaction
        .insert(bookings)
        .values({
          bookingReference: 'BK-DEV-2026-0001',
          branchId: ALPHA_PUNE_BRANCH_ID,
          clientOrganizationId: ALPHA_CLIENT_ID,
          contactId: ALPHA_TEST_RIDE_CONTACT_ID,
          createdAt: SEED_DATE,
          createdByMembershipId: '60000000-0000-4000-8000-000000000006',
          createdByUserId: '50000000-0000-4000-8000-000000000006',
          currency: 'INR',
          customerConfirmedAt: SEED_DATE,
          expectedDeliveryAt: new Date('2026-09-15T00:00:00.000Z'),
          id: ALPHA_COMMERCIAL_BOOKING_ID,
          leadId: ALPHA_TEST_RIDE_LEAD_ID,
          payableMinor: 2_950_000,
          paymentType: 'FINANCE',
          quotationId: ALPHA_COMMERCIAL_QUOTATION_ID,
          quotationVersion: 1,
          selectedInventoryUnitId: ALPHA_DELIVERY_INVENTORY_UNIT_ID,
          status: 'CONFIRMED',
          updatedAt: SEED_DATE,
        })
        .onConflictDoUpdate({
          target: bookings.id,
          set: {
            selectedInventoryUnitId: ALPHA_DELIVERY_INVENTORY_UNIT_ID,
            updatedAt: SEED_DATE,
          },
        });
      for (const item of [
        { amountMinor: 2_800_000, code: 'EX_SHOWROOM', description: 'Ex-showroom price' },
        { amountMinor: 200_000, code: 'RTO', description: 'Registration and road tax' },
        { amountMinor: 50_000, code: 'DISCOUNT', description: 'Approved development discount' },
      ]) {
        await transaction
          .insert(bookingItems)
          .values({
            ...item,
            bookingId: ALPHA_COMMERCIAL_BOOKING_ID,
            clientOrganizationId: ALPHA_CLIENT_ID,
            quantity: 1,
          })
          .onConflictDoNothing();
      }
      await transaction
        .insert(paymentEntries)
        .values({
          amountMinor: 250_000,
          bookingId: ALPHA_COMMERCIAL_BOOKING_ID,
          clientOrganizationId: ALPHA_CLIENT_ID,
          createdAt: SEED_DATE,
          createdByMembershipId: '60000000-0000-4000-8000-000000000009',
          createdByUserId: '50000000-0000-4000-8000-000000000009',
          currency: 'INR',
          id: ALPHA_COMMERCIAL_PAYMENT_ID,
          kind: 'PAYMENT',
          method: 'UPI',
          paymentReference: 'PAY-DEV-2026-0001',
          receivedAt: SEED_DATE,
        })
        .onConflictDoNothing();
      await transaction
        .insert(paymentVerificationEvents)
        .values({
          actorMembershipId: '60000000-0000-4000-8000-000000000009',
          clientOrganizationId: ALPHA_CLIENT_ID,
          createdAt: SEED_DATE,
          fromStatus: 'PENDING_VERIFICATION',
          id: ALPHA_COMMERCIAL_PAYMENT_EVENT_ID,
          paymentEntryId: ALPHA_COMMERCIAL_PAYMENT_ID,
          reason: 'Development seed verified receipt.',
          toStatus: 'VERIFIED',
        })
        .onConflictDoNothing();
      await transaction
        .insert(financeCases)
        .values({
          appliedAmountMinor: 2_700_000,
          bookingId: ALPHA_COMMERCIAL_BOOKING_ID,
          clientOrganizationId: ALPHA_CLIENT_ID,
          createdAt: SEED_DATE,
          createdByMembershipId: '60000000-0000-4000-8000-000000000006',
          currency: 'INR',
          downPaymentMinor: 250_000,
          id: ALPHA_COMMERCIAL_FINANCE_ID,
          partnerName: 'Development Finance Partner',
          providerReference: 'FIN-DEV-2026-0001',
          status: 'APPLIED',
          updatedAt: SEED_DATE,
        })
        .onConflictDoNothing();
      await transaction
        .insert(financeCaseEvents)
        .values({
          actorMembershipId: '60000000-0000-4000-8000-000000000006',
          amountMinor: 2_700_000,
          clientOrganizationId: ALPHA_CLIENT_ID,
          financeCaseId: ALPHA_COMMERCIAL_FINANCE_ID,
          fromStatus: null,
          id: ALPHA_COMMERCIAL_FINANCE_EVENT_ID,
          occurredAt: SEED_DATE,
          providerReference: 'FIN-DEV-2026-0001',
          reason: 'Development seed application.',
          toStatus: 'APPLIED',
        })
        .onConflictDoNothing();
      await transaction
        .insert(inventoryAllocations)
        .values({
          allocatedAt: SEED_DATE,
          allocatedByMembershipId: '60000000-0000-4000-8000-000000000003',
          allocatedByUserId: '50000000-0000-4000-8000-000000000003',
          bookingId: ALPHA_COMMERCIAL_BOOKING_ID,
          bookingReference: 'BK-DEV-2026-0001',
          clientOrganizationId: ALPHA_CLIENT_ID,
          customerCommunicationDecision: 'Development fixture; no customer notification.',
          id: ALPHA_DELIVERY_ALLOCATION_ID,
          inventoryUnitId: ALPHA_DELIVERY_INVENTORY_UNIT_ID,
          readinessAsserted: true,
          reason: 'Development seed canonical booking allocation.',
          status: 'ACTIVE',
        })
        .onConflictDoNothing();
      await transaction
        .insert(deliverySettings)
        .values({
          activeTimeoutMinutes: 480,
          clientOrganizationId: ALPHA_CLIENT_ID,
          locationRetentionDays: 30,
          locationStaleSeconds: 180,
          requiredChecklistCodes: [
            'ACCESSORIES',
            'PDI',
            'DOCUMENTS',
            'FUEL_OR_CHARGE',
            'BATTERY',
            'EXTERIOR_CONDITION',
            'INTERIOR_CONDITION',
          ],
          requiredProofTypes: ['RECEIVED_BY'],
          updatedAt: SEED_DATE,
          updatedByMembershipId: '60000000-0000-4000-8000-000000000003',
        })
        .onConflictDoUpdate({
          target: deliverySettings.clientOrganizationId,
          set: {
            requiredProofTypes: ['RECEIVED_BY'],
            updatedAt: SEED_DATE,
          },
        });
      await transaction
        .insert(deliveryJobs)
        .values({
          assignedMembershipId: '60000000-0000-4000-8000-000000000010',
          assignedUserId: '50000000-0000-4000-8000-000000000010',
          bookingId: ALPHA_COMMERCIAL_BOOKING_ID,
          branchId: ALPHA_PUNE_BRANCH_ID,
          clientOrganizationId: ALPHA_CLIENT_ID,
          contactId: ALPHA_TEST_RIDE_CONTACT_ID,
          createdAt: SEED_DATE,
          createdByMembershipId: '60000000-0000-4000-8000-000000000003',
          destinationAddress: 'Baner, Pune, Maharashtra',
          destinationLatitude: 18.559,
          destinationLongitude: 73.7868,
          id: ALPHA_DELIVERY_JOB_ID,
          inventoryUnitId: ALPHA_DELIVERY_INVENTORY_UNIT_ID,
          leadId: ALPHA_TEST_RIDE_LEAD_ID,
          scheduledFor: new Date('2026-09-15T05:30:00.000Z'),
          status: 'VEHICLE_PREPARATION',
          updatedAt: SEED_DATE,
        })
        .onConflictDoUpdate({
          target: deliveryJobs.id,
          set: {
            assignedMembershipId: '60000000-0000-4000-8000-000000000010',
            assignedUserId: '50000000-0000-4000-8000-000000000010',
            updatedAt: SEED_DATE,
          },
        });
      for (const code of [
        'ACCESSORIES',
        'PDI',
        'DOCUMENTS',
        'FUEL_OR_CHARGE',
        'BATTERY',
        'EXTERIOR_CONDITION',
        'INTERIOR_CONDITION',
      ] as const) {
        await transaction
          .insert(deliveryChecklistItems)
          .values({
            checked: code === 'ACCESSORIES',
            checkedAt: code === 'ACCESSORIES' ? SEED_DATE : null,
            checkedByMembershipId:
              code === 'ACCESSORIES' ? '60000000-0000-4000-8000-000000000003' : null,
            clientOrganizationId: ALPHA_CLIENT_ID,
            code,
            deliveryJobId: ALPHA_DELIVERY_JOB_ID,
            note: code === 'ACCESSORIES' ? 'Accessory fitment checked.' : null,
            required: true,
          })
          .onConflictDoNothing();
      }
      await transaction
        .insert(deliveryStatusEvents)
        .values({
          actorMembershipId: '60000000-0000-4000-8000-000000000003',
          clientOrganizationId: ALPHA_CLIENT_ID,
          correlationId: 'development-seed-phase-9',
          createdAt: SEED_DATE,
          deliveryJobId: ALPHA_DELIVERY_JOB_ID,
          eventType: 'DELIVERY_CREATED',
          evidence: { development_fixture: true },
          fromStatus: null,
          id: ALPHA_DELIVERY_EVENT_ID,
          reason: 'Development delivery fixture.',
          toStatus: 'VEHICLE_PREPARATION',
        })
        .onConflictDoNothing();
      await transaction
        .insert(registrationSettings)
        .values({
          clientOrganizationId: ALPHA_CLIENT_ID,
          slaHours: {
            DOCUMENTS_READY: 48,
            REGISTRATION_STARTED: 48,
            RTO_SUBMITTED: 168,
            NUMBER_ALLOTTED: 168,
            RC_PENDING: 720,
            RC_RECEIVED: 48,
            RC_SHARED_COLLECTED: 48,
            REOPENED: 48,
          },
          updatedAt: SEED_DATE,
          updatedByMembershipId: '60000000-0000-4000-8000-000000000003',
        })
        .onConflictDoUpdate({
          target: registrationSettings.clientOrganizationId,
          set: { updatedAt: SEED_DATE },
        });
      await transaction
        .insert(registrationCases)
        .values({
          assignedMembershipId: '60000000-0000-4000-8000-000000000011',
          assignedUserId: '50000000-0000-4000-8000-000000000011',
          bookingId: ALPHA_COMMERCIAL_BOOKING_ID,
          branchId: ALPHA_PUNE_BRANCH_ID,
          clientOrganizationId: ALPHA_CLIENT_ID,
          contactId: ALPHA_TEST_RIDE_CONTACT_ID,
          createdAt: SEED_DATE,
          createdByMembershipId: '60000000-0000-4000-8000-000000000003',
          expectedCompletionAt: new Date('2026-08-03T00:00:00.000Z'),
          id: ALPHA_REGISTRATION_CASE_ID,
          inventoryUnitId: ALPHA_DELIVERY_INVENTORY_UNIT_ID,
          status: 'DOCUMENTS_READY',
          statusChangedAt: SEED_DATE,
          updatedAt: SEED_DATE,
        })
        .onConflictDoUpdate({
          target: registrationCases.id,
          set: {
            assignedMembershipId: '60000000-0000-4000-8000-000000000011',
            assignedUserId: '50000000-0000-4000-8000-000000000011',
            updatedAt: SEED_DATE,
          },
        });
      await transaction
        .insert(registrationEvents)
        .values({
          actorMembershipId: '60000000-0000-4000-8000-000000000003',
          clientOrganizationId: ALPHA_CLIENT_ID,
          correlationId: 'development-seed-phase-10',
          createdAt: SEED_DATE,
          eventType: 'REGISTRATION_CASE_CREATED',
          evidence: { development_fixture: true },
          fromStatus: null,
          id: ALPHA_REGISTRATION_EVENT_ID,
          registrationCaseId: ALPHA_REGISTRATION_CASE_ID,
          toStatus: 'DOCUMENTS_READY',
        })
        .onConflictDoNothing();
      await transaction
        .insert(customerVehicles)
        .values({
          branchId: ALPHA_PUNE_BRANCH_ID,
          brandName: 'Legacy Motors',
          clientOrganizationId: ALPHA_CLIENT_ID,
          contactId: ALPHA_TEST_RIDE_CONTACT_ID,
          createdAt: SEED_DATE,
          createdByMembershipId: '60000000-0000-4000-8000-000000000011',
          engineNumber: 'LEGACYENGINE0001',
          id: ALPHA_EXTERNAL_CUSTOMER_VEHICLE_ID,
          modelName: 'City Runner',
          modelYear: 2024,
          ownershipSource: 'EXTERNAL',
          currentOdometerKm: 8_400,
          insuranceExpiresOn: '2026-09-30',
          pucExpiresOn: '2026-10-15',
          purchaseDate: '2024-06-15',
          registrationNumber: 'MH12DEV1001',
          updatedAt: SEED_DATE,
          variantName: 'Petrol Manual',
          vin: 'LEGACYVIN000000001',
          warrantyExpiresOn: '2027-06-14',
          serviceDueKilometres: 10_000,
          serviceDueOn: '2026-09-01',
          servicePlanVersion: 'LEGACY-CITY-2024-v1',
        })
        .onConflictDoUpdate({
          target: customerVehicles.id,
          set: {
            currentOdometerKm: 8_400,
            insuranceExpiresOn: '2026-09-30',
            modelYear: 2024,
            pucExpiresOn: '2026-10-15',
            serviceDueKilometres: 10_000,
            serviceDueOn: '2026-09-01',
            servicePlanVersion: 'LEGACY-CITY-2024-v1',
            updatedAt: SEED_DATE,
          },
        });
      await transaction
        .insert(customerVehicleEvents)
        .values({
          actorMembershipId: '60000000-0000-4000-8000-000000000011',
          clientOrganizationId: ALPHA_CLIENT_ID,
          correlationId: 'development-seed-phase-10',
          createdAt: SEED_DATE,
          customerVehicleId: ALPHA_EXTERNAL_CUSTOMER_VEHICLE_ID,
          eventType: 'EXTERNAL_CUSTOMER_VEHICLE_CREATED',
          evidence: { development_fixture: true, ownership_source: 'EXTERNAL' },
          id: ALPHA_EXTERNAL_CUSTOMER_VEHICLE_EVENT_ID,
        })
        .onConflictDoNothing();
      await transaction
        .insert(testRideJobs)
        .values({
          assignedAt: SEED_DATE,
          assignedBy: '50000000-0000-4000-8000-000000000004',
          branchId: ALPHA_PUNE_BRANCH_ID,
          clientOrganizationId: ALPHA_CLIENT_ID,
          confirmedAt: SEED_DATE,
          confirmationChannel: 'CALL',
          contactId: ALPHA_TEST_RIDE_CONTACT_ID,
          createdAt: SEED_DATE,
          createdBy: '50000000-0000-4000-8000-000000000006',
          customerLocation: 'Baner, Pune',
          demoVehicleReference: 'DEMO-EV-ZX-01',
          executiveMembershipId: '60000000-0000-4000-8000-000000000007',
          executiveUserId: '50000000-0000-4000-8000-000000000007',
          id: ALPHA_TEST_RIDE_JOB_ID,
          inventoryUnitId: ALPHA_DEMO_INVENTORY_UNIT_ID,
          leadId: ALPHA_TEST_RIDE_LEAD_ID,
          notes: 'Development fixture ready for the executive start flow.',
          scheduledEndAt: new Date('2026-08-09T06:30:00.000Z'),
          scheduledStartAt: new Date('2026-08-09T05:30:00.000Z'),
          status: 'EXECUTIVE_ASSIGNED',
          teamId: ALPHA_PUNE_TEAM_ID,
          updatedAt: SEED_DATE,
          vehicleModel: 'Demo EV ZX',
        })
        .onConflictDoUpdate({
          target: testRideJobs.id,
          set: { inventoryUnitId: ALPHA_DEMO_INVENTORY_UNIT_ID, updatedAt: SEED_DATE },
        });
      await transaction
        .insert(demoVehicleBookings)
        .values({
          clientOrganizationId: ALPHA_CLIENT_ID,
          createdAt: SEED_DATE,
          demoVehicleReference: 'DEMO-EV-ZX-01',
          id: ALPHA_TEST_RIDE_BOOKING_ID,
          inventoryUnitId: ALPHA_DEMO_INVENTORY_UNIT_ID,
          branchId: ALPHA_PUNE_BRANCH_ID,
          scheduledEndAt: new Date('2026-08-09T06:30:00.000Z'),
          scheduledStartAt: new Date('2026-08-09T05:30:00.000Z'),
          status: 'HELD',
          testRideJobId: ALPHA_TEST_RIDE_JOB_ID,
        })
        .onConflictDoUpdate({
          target: demoVehicleBookings.id,
          set: { inventoryUnitId: ALPHA_DEMO_INVENTORY_UNIT_ID },
        });
      await transaction
        .insert(testRideEvents)
        .values({
          actorMembershipId: '60000000-0000-4000-8000-000000000004',
          actorUserId: '50000000-0000-4000-8000-000000000004',
          clientOrganizationId: ALPHA_CLIENT_ID,
          createdAt: SEED_DATE,
          eventType: 'RIDE_ASSIGNED',
          evidence: { development_fixture: true },
          fromStatus: 'CUSTOMER_CONFIRMED',
          id: ALPHA_TEST_RIDE_EVENT_ID,
          reason: 'Development seed assignment.',
          testRideJobId: ALPHA_TEST_RIDE_JOB_ID,
          toStatus: 'EXECUTIVE_ASSIGNED',
        })
        .onConflictDoNothing();
      await transaction
        .insert(telephonyProviderConnections)
        .values({
          clientOrganizationId: ALPHA_CLIENT_ID,
          connectionKey: 'seed-alpha-development-telephony',
          displayName: 'Alpha development telephony',
          provider: 'DEVELOPMENT',
          settings: { development_only: true },
          status: 'ACTIVE',
          updatedAt: SEED_DATE,
        })
        .onConflictDoUpdate({
          target: [
            telephonyProviderConnections.clientOrganizationId,
            telephonyProviderConnections.provider,
          ],
          set: {
            displayName: 'Alpha development telephony',
            settings: { development_only: true },
            status: 'ACTIVE',
            updatedAt: SEED_DATE,
          },
        });
      await transaction
        .insert(messagingProviderConnections)
        .values({
          branchId: ALPHA_PUNE_BRANCH_ID,
          businessPhoneE164: '+919999000001',
          channel: 'WHATSAPP',
          clientOrganizationId: ALPHA_CLIENT_ID,
          connectionKey: 'seed-alpha-development-messaging',
          defaultAssignmentQueueId: alphaQueueId,
          displayName: 'Alpha development WhatsApp',
          id: ALPHA_MESSAGING_CONNECTION_ID,
          phoneNumberId: 'seed-alpha-development-phone',
          provider: 'DEVELOPMENT',
          settings: { development_only: true },
          status: 'ACTIVE',
          templateSyncStatus: 'SYNCED',
          templateSyncedAt: SEED_DATE,
          updatedAt: SEED_DATE,
          webhookState: 'VERIFIED',
        })
        .onConflictDoUpdate({
          target: messagingProviderConnections.id,
          set: {
            defaultAssignmentQueueId: alphaQueueId,
            displayName: 'Alpha development WhatsApp',
            status: 'ACTIVE',
            templateSyncStatus: 'SYNCED',
            templateSyncedAt: SEED_DATE,
            updatedAt: SEED_DATE,
            webhookState: 'VERIFIED',
          },
        });
      for (const template of [
        {
          bodyText: 'Hello {{1}}, this is an update about your vehicle enquiry.',
          category: 'UTILITY' as const,
          id: '24000000-0000-4000-8000-000000000001',
          name: 'lead_follow_up_update',
        },
        {
          bodyText: 'Hello {{1}}, explore the latest offers from our dealership.',
          category: 'MARKETING' as const,
          id: '24000000-0000-4000-8000-000000000002',
          name: 'dealership_offer',
        },
        {
          bodyText: 'Your vehicle service milestone is approaching. Please contact the dealership.',
          category: 'UTILITY' as const,
          id: '24000000-0000-4000-8000-000000000003',
          name: 'service_due_reminder',
        },
        {
          bodyText: 'Explore upgrade and exchange options available for your vehicle.',
          category: 'MARKETING' as const,
          id: '24000000-0000-4000-8000-000000000004',
          name: 'upgrade_opportunity',
        },
      ]) {
        await transaction
          .insert(messageTemplates)
          .values({
            bodyText: template.bodyText,
            category: template.category,
            clientOrganizationId: ALPHA_CLIENT_ID,
            connectionId: ALPHA_MESSAGING_CONNECTION_ID,
            externalTemplateId: `dev-${template.name}`,
            id: template.id,
            language: 'en',
            lastSyncedAt: SEED_DATE,
            name: template.name,
            providerMetadata: { development_fixture: true },
            status: 'APPROVED',
            updatedAt: SEED_DATE,
          })
          .onConflictDoUpdate({
            target: messageTemplates.id,
            set: {
              bodyText: template.bodyText,
              category: template.category,
              lastSyncedAt: SEED_DATE,
              status: 'APPROVED',
              updatedAt: SEED_DATE,
            },
          });
      }
      const [serviceReminderDefinition] = await transaction
        .insert(reminderDefinitions)
        .values({
          clientOrganizationId: ALPHA_CLIENT_ID,
          defaultCategory: 'OPERATIONAL',
          displayName: 'Service due',
          type: 'SERVICE_DUE',
        })
        .onConflictDoUpdate({
          target: [reminderDefinitions.clientOrganizationId, reminderDefinitions.type],
          set: { active: true, displayName: 'Service due' },
        })
        .returning({ id: reminderDefinitions.id });
      const [upgradeReminderDefinition] = await transaction
        .insert(reminderDefinitions)
        .values({
          clientOrganizationId: ALPHA_CLIENT_ID,
          defaultCategory: 'MARKETING',
          displayName: 'Upgrade opportunity',
          type: 'UPGRADE_OPPORTUNITY',
        })
        .onConflictDoUpdate({
          target: [reminderDefinitions.clientOrganizationId, reminderDefinitions.type],
          set: { active: true, displayName: 'Upgrade opportunity' },
        })
        .returning({ id: reminderDefinitions.id });
      if (!serviceReminderDefinition || !upgradeReminderDefinition)
        throw new Error('Could not resolve Phase 11 reminder definitions.');
      await transaction
        .insert(reminderRuleTemplates)
        .values([
          {
            baseDateField: 'DELIVERY_DATE',
            category: 'OPERATIONAL',
            channel: 'WHATSAPP',
            clientOrganizationId: ALPHA_CLIENT_ID,
            createdByMembershipId: '60000000-0000-4000-8000-000000000003',
            dueAfterDays: 180,
            id: ALPHA_SERVICE_REMINDER_RULE_ID,
            modelName: 'City Runner',
            noticeDays: [30, 15, 7, 1],
            reminderDefinitionId: serviceReminderDefinition.id,
            templateId: '24000000-0000-4000-8000-000000000003',
            thresholdKind: 'DATE',
          },
          {
            baseDateField: 'PURCHASE_DATE',
            category: 'MARKETING',
            channel: 'WHATSAPP',
            clientOrganizationId: ALPHA_CLIENT_ID,
            createdByMembershipId: '60000000-0000-4000-8000-000000000003',
            dueAfterDays: 1_095,
            id: ALPHA_UPGRADE_REMINDER_RULE_ID,
            noticeDays: [30, 7],
            reminderDefinitionId: upgradeReminderDefinition.id,
            templateId: '24000000-0000-4000-8000-000000000004',
            thresholdKind: 'DATE',
          },
        ])
        .onConflictDoNothing();
      await transaction
        .insert(customerReminderPreferences)
        .values({
          clientOrganizationId: ALPHA_CLIENT_ID,
          customerVehicleId: ALPHA_EXTERNAL_CUSTOMER_VEHICLE_ID,
          marketingEnabled: false,
          operationalEnabled: true,
          preferredChannel: 'WHATSAPP',
          updatedByMembershipId: '60000000-0000-4000-8000-000000000003',
        })
        .onConflictDoNothing();
      await transaction
        .insert(customerReminderPlans)
        .values({
          clientOrganizationId: ALPHA_CLIENT_ID,
          customerVehicleId: ALPHA_EXTERNAL_CUSTOMER_VEHICLE_ID,
          dueAt: new Date('2026-09-01T00:00:00.000Z'),
          id: ALPHA_SERVICE_REMINDER_PLAN_ID,
          ruleTemplateId: ALPHA_SERVICE_REMINDER_RULE_ID,
          ruleVersion: 1,
          sourceVehicleVersion: 1,
        })
        .onConflictDoNothing();
      for (const reminder of [
        {
          eventId: '84000000-0000-4000-8000-000000000001',
          id: '83000000-0000-4000-8000-000000000001',
          key: 'seed-service:scheduled',
          scheduledFor: new Date('2026-08-17T00:00:00.000Z'),
          status: 'SCHEDULED' as const,
        },
        {
          eventId: '84000000-0000-4000-8000-000000000002',
          id: '83000000-0000-4000-8000-000000000002',
          key: 'seed-service:failed',
          scheduledFor: new Date('2026-08-01T00:00:00.000Z'),
          status: 'FAILED' as const,
        },
        {
          eventId: '84000000-0000-4000-8000-000000000003',
          id: '83000000-0000-4000-8000-000000000003',
          key: 'seed-service:suppressed',
          scheduledFor: new Date('2026-08-01T00:00:00.000Z'),
          status: 'SUPPRESSED' as const,
          suppressionReason: 'Development fixture demonstrating customer preference suppression.',
        },
      ]) {
        await transaction
          .insert(reminderInstances)
          .values({
            category: 'OPERATIONAL',
            channel: 'WHATSAPP',
            clientOrganizationId: ALPHA_CLIENT_ID,
            customerReminderPlanId: ALPHA_SERVICE_REMINDER_PLAN_ID,
            id: reminder.id,
            materializationKey: reminder.key,
            retryCount: reminder.status === 'FAILED' ? 1 : 0,
            scheduledFor: reminder.scheduledFor,
            status: reminder.status,
            suppressionReason: reminder.suppressionReason,
            templateId: '24000000-0000-4000-8000-000000000003',
          })
          .onConflictDoNothing();
        await transaction
          .insert(reminderEvents)
          .values({
            clientOrganizationId: ALPHA_CLIENT_ID,
            correlationId: 'development-seed-phase-11',
            eventType: `REMINDER_${reminder.status}`,
            evidence: { development_fixture: true },
            id: reminder.eventId,
            reminderInstanceId: reminder.id,
            toStatus: reminder.status,
          })
          .onConflictDoNothing();
      }
    });
  } finally {
    await connection.close();
  }

  process.stdout.write(
    `Seeded ${String(seedUsers.length)} development users across two client organizations.\n`,
  );
}

const invokedPath = process.argv[1];
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  await seed();
}

export { DEVELOPMENT_SEED_PASSWORD, seed, seedUsers as DEVELOPMENT_SEED_USERS };
