import { and, eq, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import type { AuthorizationContext } from './authorization.types.js';

export interface ResourceScopeColumns {
  assignee?: AnyPgColumn;
  branch: AnyPgColumn;
  department?: AnyPgColumn;
  owner?: AnyPgColumn;
  team?: AnyPgColumn;
}

/**
 * Mirrors AuthorizationPolicy resource scope in SQL so pagination happens only after scope denial.
 * The caller must still include the tenant predicate and may retain a defensive row-level check.
 */
export function authorizationScopeCondition(
  context: AuthorizationContext,
  columns: ResourceScopeColumns,
): SQL {
  const conditions: SQL[] = [
    scopeModeCondition(context.branchScopeMode, context.branchIds, columns.branch),
  ];
  if (columns.department)
    conditions.push(
      nullableScopeModeCondition(
        context.departmentScopeMode,
        context.departmentIds,
        columns.department,
      ),
    );
  if (columns.team)
    conditions.push(
      nullableScopeModeCondition(
        context.teamScopeMode,
        new Set([...context.teamIds, ...context.managedTeamIds]),
        columns.team,
      ),
    );

  if (context.assignmentScope === 'ASSIGNED' && columns.assignee)
    conditions.push(eq(columns.assignee, context.userId));
  if (context.assignmentScope === 'OWNED' && columns.owner)
    conditions.push(eq(columns.owner, context.userId));
  if (context.assignmentScope === 'OWNED_OR_ASSIGNED') {
    const ownership = [
      columns.owner ? eq(columns.owner, context.userId) : undefined,
      columns.assignee ? eq(columns.assignee, context.userId) : undefined,
    ].filter((value): value is SQL => value !== undefined);
    conditions.push(ownership.length ? (or(...ownership) ?? sql`false`) : sql`false`);
  }
  if (context.assignmentScope === 'TEAM')
    conditions.push(columns.team ? isNotNull(columns.team) : sql`false`);
  if (context.assignmentScope === 'NONE') conditions.push(sql`false`);

  return and(...conditions) ?? sql`true`;
}

function scopeModeCondition(
  mode: AuthorizationContext['branchScopeMode'],
  ids: ReadonlySet<string>,
  column: AnyPgColumn,
): SQL {
  if (mode === 'ALL') return sql`true`;
  if (mode === 'SELECTED' && ids.size) return inArray(column, [...ids]);
  return sql`false`;
}

function nullableScopeModeCondition(
  mode: AuthorizationContext['departmentScopeMode'],
  ids: ReadonlySet<string>,
  column: AnyPgColumn,
): SQL {
  if (mode === 'ALL') return sql`true`;
  if (mode === 'SELECTED' && ids.size)
    return or(isNull(column), inArray(column, [...ids])) ?? sql`false`;
  return isNull(column);
}

export function pageOffset(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}

export function pageMetadata(
  page: number,
  pageSize: number,
  fetched: number,
): { has_next: boolean; page: number; page_size: number } {
  return { has_next: fetched > pageSize, page, page_size: pageSize };
}
