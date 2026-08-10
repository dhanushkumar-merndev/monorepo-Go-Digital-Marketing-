import { z } from 'zod';

import {
  assignmentScopeSchema,
  canonicalRoleCodeSchema,
  membershipScopeModeSchema,
} from '../auth/authorization.js';
import {
  clientOrganizationSummarySchema,
  normalizedEmailSchema,
  tenantUserSummarySchema,
} from '../auth/contracts.js';
import { reportRangeSchema } from '../reporting/contracts.js';

const idSchema = z.uuid();
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/u);
const nonBlank = (max: number) => z.string().trim().min(1).max(max);

export const clientModuleSchema = z.enum([
  'LEADS',
  'TELEPHONY',
  'INBOX',
  'TEST_RIDES',
  'INVENTORY',
  'BOOKING_BILLING',
  'DELIVERY_RC',
  'POST_SALE',
  'INTEGRATIONS',
]);
export const integrationReadinessStatusSchema = z.enum([
  'NOT_CONNECTED',
  'PENDING_APPROVAL',
  'ACTIVE',
  'DEGRADED',
  'ACTION_REQUIRED',
  'SUSPENDED',
]);

export const createClientRequestSchema = z.object({
  code: nonBlank(64).regex(
    /^[A-Z0-9_-]+$/u,
    'Use uppercase letters, numbers, underscores or hyphens',
  ),
  display_name: nonBlank(200),
  legal_name: nonBlank(240),
  timezone: nonBlank(64).default('Asia/Kolkata'),
});
export const updateClientRequestSchema = z.object({
  display_name: nonBlank(200),
  legal_name: nonBlank(240),
  timezone: nonBlank(64),
});
export const setClientStatusRequestSchema = z.object({
  reason: nonBlank(1000),
  status: z.enum(['ACTIVE', 'SUSPENDED']),
});
export const clientDetailResponseSchema = z.object({
  client_organization: clientOrganizationSummarySchema,
  usage: z.object({
    active_users: z.number().int().nonnegative(),
    branches: z.number().int().nonnegative(),
    teams: z.number().int().nonnegative(),
  }),
});

export const agencyDashboardQuerySchema = reportRangeSchema.omit({
  branch_id: true,
  team_id: true,
});
export const agencyClientLeadKpiSchema = z.object({
  client_organization: clientOrganizationSummarySchema,
  converted: z.number().int().nonnegative(),
  conversion_rate: z.number().min(0).max(100),
  in_progress: z.number().int().nonnegative(),
  leads_received: z.number().int().nonnegative(),
  lost: z.number().int().nonnegative(),
  new: z.number().int().nonnegative(),
  pending_review: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
});
export const agencyDashboardResponseSchema = z.object({
  clients: z.array(agencyClientLeadKpiSchema),
  range: z.object({
    end_at: z.iso.datetime({ offset: true }),
    from: z.string().date(),
    start_at: z.iso.datetime({ offset: true }),
    timezone: z.string(),
    to: z.string().date(),
  }),
  totals: agencyClientLeadKpiSchema
    .omit({ client_organization: true, conversion_rate: true })
    .extend({
      client_organizations: z.number().int().nonnegative(),
      conversion_rate: z.number().min(0).max(100),
    }),
});

export const createBranchRequestSchema = z.object({
  code: nonBlank(64),
  name: nonBlank(200),
  timezone: nonBlank(64),
});
export const updateBranchRequestSchema = z.object({
  active: z.boolean(),
  code: nonBlank(64),
  name: nonBlank(200),
  timezone: nonBlank(64),
});
export const createDepartmentRequestSchema = z.object({
  branch_id: idSchema,
  code: nonBlank(64),
  name: nonBlank(200),
});
export const updateDepartmentRequestSchema = z.object({
  active: z.boolean(),
  code: nonBlank(64),
  name: nonBlank(200),
});
export const createTeamRequestSchema = z.object({
  branch_id: idSchema,
  department_id: idSchema,
  code: nonBlank(64),
  name: nonBlank(200),
});
export const updateTeamRequestSchema = z.object({
  active: z.boolean(),
  code: nonBlank(64),
  name: nonBlank(200),
});

export const workingHoursEntrySchema = z
  .object({
    closes_at: timeSchema.nullable(),
    day_of_week: z.number().int().min(0).max(6),
    is_closed: z.boolean(),
    opens_at: timeSchema.nullable(),
  })
  .superRefine((entry, context) => {
    if (entry.is_closed && (entry.opens_at !== null || entry.closes_at !== null))
      context.addIssue({ code: 'custom', message: 'Closed days cannot have opening times' });
    if (
      !entry.is_closed &&
      (!entry.opens_at || !entry.closes_at || entry.opens_at >= entry.closes_at)
    )
      context.addIssue({
        code: 'custom',
        message: 'Open days need an opening time before their closing time',
      });
  });
export const setWorkingHoursRequestSchema = z
  .object({
    hours: z.array(workingHoursEntrySchema).length(7),
  })
  .superRefine((value, context) => {
    const days = value.hours.map((entry) => entry.day_of_week);
    if (new Set(days).size !== 7)
      context.addIssue({
        code: 'custom',
        path: ['hours'],
        message: 'Provide exactly one entry for each day of the week.',
      });
  });
export const workingHoursResponseSchema = z.object({
  branch_id: idSchema,
  hours: z.array(workingHoursEntrySchema),
  version: z.number().int().positive(),
});

export const inviteUserRequestSchema = z
  .object({
    branch_ids: z.array(idSchema),
    branch_scope_mode: membershipScopeModeSchema,
    display_name: nonBlank(160),
    department_ids: z.array(idSchema),
    department_scope_mode: membershipScopeModeSchema,
    email: normalizedEmailSchema,
    job_title: nonBlank(160).nullable(),
    role_code: canonicalRoleCodeSchema.exclude(['AGENCY_ADMIN']),
    team_ids: z.array(idSchema),
    team_scope_mode: membershipScopeModeSchema,
    assignment_scope: assignmentScopeSchema,
  })
  .superRefine((value, context) => {
    if (value.branch_scope_mode !== 'SELECTED' && value.branch_ids.length > 0)
      context.addIssue({
        code: 'custom',
        path: ['branch_ids'],
        message: 'Branch IDs require SELECTED scope',
      });
    if (value.team_scope_mode !== 'SELECTED' && value.team_ids.length > 0)
      context.addIssue({
        code: 'custom',
        path: ['team_ids'],
        message: 'Team IDs require SELECTED scope',
      });
    if (value.department_scope_mode !== 'SELECTED' && value.department_ids.length > 0)
      context.addIssue({
        code: 'custom',
        path: ['department_ids'],
        message: 'Department IDs require SELECTED scope',
      });
  });
export const updateMembershipRequestSchema = z
  .object({
    branch_ids: z.array(idSchema),
    branch_scope_mode: membershipScopeModeSchema,
    department_ids: z.array(idSchema),
    department_scope_mode: membershipScopeModeSchema,
    job_title: nonBlank(160).nullable(),
    role_code: canonicalRoleCodeSchema.exclude(['AGENCY_ADMIN']),
    team_ids: z.array(idSchema),
    team_scope_mode: membershipScopeModeSchema,
    assignment_scope: assignmentScopeSchema,
  })
  .superRefine((value, context) => {
    if (value.branch_scope_mode !== 'SELECTED' && value.branch_ids.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['branch_ids'],
        message: 'Branch IDs require SELECTED scope',
      });
    }
    if (value.team_scope_mode !== 'SELECTED' && value.team_ids.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['team_ids'],
        message: 'Team IDs require SELECTED scope',
      });
    }
    if (value.department_scope_mode !== 'SELECTED' && value.department_ids.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['department_ids'],
        message: 'Department IDs require SELECTED scope',
      });
    }
  });
export const setMembershipStatusRequestSchema = z.object({
  reason: nonBlank(1000),
  status: z.enum(['ACTIVE', 'ENDED', 'SUSPENDED']),
});
export const tenantUserDetailSchema = tenantUserSummarySchema.extend({
  assignment_scope: assignmentScopeSchema,
  branch_ids: z.array(idSchema),
  branch_scope_mode: membershipScopeModeSchema,
  department_ids: z.array(idSchema),
  department_scope_mode: membershipScopeModeSchema,
  job_title: z.string().nullable(),
  team_ids: z.array(idSchema),
  team_scope_mode: membershipScopeModeSchema,
});

export const assignTeamMemberRequestSchema = z.object({
  membership_id: idSchema,
  reason: nonBlank(1000),
});
export const endTeamMembershipRequestSchema = z.object({ reason: nonBlank(1000) });
export const replaceTeamManagerRequestSchema = z.object({
  manager_membership_id: idSchema,
  reason: nonBlank(1000),
});
export const setReportingManagerRequestSchema = z.object({
  manager_membership_id: idSchema.nullable(),
  reason: nonBlank(1000),
});

export const organizationHierarchyResponseSchema = z.object({
  departments: z.array(
    z.object({
      active: z.boolean(),
      branch_id: idSchema,
      code: z.string(),
      id: idSchema,
      name: z.string(),
    }),
  ),
  reporting_lines: z.array(
    z.object({
      id: idSchema,
      manager_membership_id: idSchema,
      started_at: z.iso.datetime({ offset: true }),
      subordinate_membership_id: idSchema,
    }),
  ),
  team_manager_assignments: z.array(
    z.object({
      id: idSchema,
      manager_membership_id: idSchema,
      started_at: z.iso.datetime({ offset: true }),
      team_id: idSchema,
    }),
  ),
  team_memberships: z.array(
    z.object({
      id: idSchema,
      membership_id: idSchema,
      started_at: z.iso.datetime({ offset: true }),
      team_id: idSchema,
    }),
  ),
  teams: z.array(
    z.object({
      active: z.boolean(),
      branch_id: idSchema,
      code: z.string(),
      department_id: idSchema,
      id: idSchema,
      name: z.string(),
    }),
  ),
});
export const tenantUserDetailResponseSchema = z.object({
  user: tenantUserDetailSchema,
  invitation_delivery: z.literal('UNAVAILABLE'),
});

export const setClientSettingsRequestSchema = z.object({
  lead_assignment_ready: z.boolean(),
  retention_policy: z.object({
    audit_log_days: z.number().int().min(30).max(3650),
    export_days: z.number().int().min(1).max(365),
    recording_days: z.number().int().min(1).max(3650),
  }),
});
export const clientSettingsResponseSchema = z.object({
  lead_assignment_ready: z.boolean(),
  retention_policy: z.record(z.string(), z.unknown()),
  version: z.number().int().positive(),
});
export const setModuleFlagRequestSchema = z.object({
  enabled: z.boolean(),
  reason: z.string().trim().max(500).nullable(),
});
export const moduleFlagsResponseSchema = z.object({
  flags: z.array(
    z.object({ enabled: z.boolean(), module: clientModuleSchema, reason: z.string().nullable() }),
  ),
});
export const integrationReadinessResponseSchema = z.object({
  integrations: z.array(
    z.object({
      detail: z.string().nullable(),
      integration: z.string(),
      status: integrationReadinessStatusSchema,
    }),
  ),
});
export const setAgencyDefaultsRequestSchema = z.object({
  default_feature_flags: z.record(clientModuleSchema, z.boolean()),
  default_timezone: nonBlank(64),
});
export const agencyDefaultsResponseSchema = z.object({
  default_feature_flags: z.record(clientModuleSchema, z.boolean()),
  default_timezone: z.string(),
});
export const auditTimelineResponseSchema = z.object({
  events: z.array(
    z.object({
      action: z.string(),
      actor_id: z.string().nullable(),
      created_at: z.iso.datetime({ offset: true }),
      entity_id: z.string(),
      entity_type: z.string(),
      new_summary: z.record(z.string(), z.unknown()).nullable(),
      old_summary: z.record(z.string(), z.unknown()).nullable(),
      reason: z.string().nullable(),
    }),
  ),
});

export type CreateClientRequest = z.infer<typeof createClientRequestSchema>;
export type AgencyDashboardQuery = z.infer<typeof agencyDashboardQuerySchema>;
export type AgencyDashboardResponse = z.infer<typeof agencyDashboardResponseSchema>;
export type UpdateClientRequest = z.infer<typeof updateClientRequestSchema>;
export type SetClientStatusRequest = z.infer<typeof setClientStatusRequestSchema>;
export type CreateBranchRequest = z.infer<typeof createBranchRequestSchema>;
export type CreateDepartmentRequest = z.infer<typeof createDepartmentRequestSchema>;
export type UpdateBranchRequest = z.infer<typeof updateBranchRequestSchema>;
export type UpdateDepartmentRequest = z.infer<typeof updateDepartmentRequestSchema>;
export type CreateTeamRequest = z.infer<typeof createTeamRequestSchema>;
export type UpdateTeamRequest = z.infer<typeof updateTeamRequestSchema>;
export type InviteUserRequest = z.infer<typeof inviteUserRequestSchema>;
export type UpdateMembershipRequest = z.infer<typeof updateMembershipRequestSchema>;
export type SetMembershipStatusRequest = z.infer<typeof setMembershipStatusRequestSchema>;
export type SetWorkingHoursRequest = z.infer<typeof setWorkingHoursRequestSchema>;
export type SetClientSettingsRequest = z.infer<typeof setClientSettingsRequestSchema>;
export type SetModuleFlagRequest = z.infer<typeof setModuleFlagRequestSchema>;
export type SetAgencyDefaultsRequest = z.infer<typeof setAgencyDefaultsRequestSchema>;
export type AssignTeamMemberRequest = z.infer<typeof assignTeamMemberRequestSchema>;
export type EndTeamMembershipRequest = z.infer<typeof endTeamMembershipRequestSchema>;
export type ReplaceTeamManagerRequest = z.infer<typeof replaceTeamManagerRequestSchema>;
export type SetReportingManagerRequest = z.infer<typeof setReportingManagerRequestSchema>;
