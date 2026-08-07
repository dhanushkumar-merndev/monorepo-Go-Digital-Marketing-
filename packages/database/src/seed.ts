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
  leadSettings,
  membershipBranchScopes,
  membershipDepartmentScopes,
  membershipTeamScopes,
  memberships,
  permissions,
  publicLeadForms,
  rolePermissionMappings,
  reportingLines,
  roles,
  teamManagerAssignments,
  teamMemberships,
  teams,
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
};

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
  ],
  SALES_MANAGER: [
    ...accountPermissions,
    ...scopedOrganizationReadPermissions,
    'organization.users.read',
    'organization.roles.read',
    'organization.hierarchy.read',
    'organization.hierarchy.manage',
    ...leadManagerPermissions,
  ],
  TELECALLER: [
    ...accountPermissions,
    ...scopedOrganizationReadPermissions,
    'leads.create',
    ...leadAgentPermissions,
  ],
  SALESPERSON: [
    ...accountPermissions,
    ...scopedOrganizationReadPermissions,
    ...leadAgentPermissions,
  ],
  TEST_RIDE_EXECUTIVE: [...accountPermissions, ...scopedOrganizationReadPermissions],
  INVENTORY_EXECUTIVE: [...accountPermissions, ...scopedOrganizationReadPermissions],
  BILLING_DOCUMENTATION_EXECUTIVE: [...accountPermissions, ...scopedOrganizationReadPermissions],
  DELIVERY_EXECUTIVE: [...accountPermissions, ...scopedOrganizationReadPermissions],
  RC_REGISTRATION_EXECUTIVE: [...accountPermissions, ...scopedOrganizationReadPermissions],
  TEAM_MANAGER: [
    ...accountPermissions,
    ...scopedOrganizationReadPermissions,
    'organization.users.read',
    'organization.hierarchy.read',
    ...leadManagerPermissions,
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
    branchIds: [ALPHA_MUMBAI_BRANCH_ID],
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
    branchIds: [ALPHA_MUMBAI_BRANCH_ID],
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
          defaultFeatureFlags: { LEADS: true },
          updatedAt: SEED_DATE,
        })
        .onConflictDoUpdate({
          target: agencyDefaults.agencyId,
          set: {
            defaultTimezone: 'Asia/Kolkata',
            defaultFeatureFlags: { LEADS: true },
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
          await transaction
            .insert(clientModuleFlags)
            .values({
              clientOrganizationId,
              module,
              enabled: module === 'LEADS',
              reason:
                module === 'LEADS' ? 'Development seed default' : 'Not enabled in development seed',
              updatedAt: SEED_DATE,
            })
            .onConflictDoUpdate({
              target: [clientModuleFlags.clientOrganizationId, clientModuleFlags.module],
              set: {
                enabled: module === 'LEADS',
                reason:
                  module === 'LEADS'
                    ? 'Development seed default'
                    : 'Not enabled in development seed',
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
