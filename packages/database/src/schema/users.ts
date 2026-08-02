import { index, pgEnum, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

export const userStatusEnum = pgEnum('user_status', [
  'INVITED',
  'ACTIVE',
  'SUSPENDED',
  'DEACTIVATED',
]);

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    displayName: varchar('display_name', { length: 160 }).notNull(),
    primaryEmailNormalized: varchar('primary_email_normalized', { length: 320 }).notNull(),
    status: userStatusEnum('status').default('INVITED').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    suspendedAt: timestamp('suspended_at', { withTimezone: true, mode: 'date' }),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    uniqueIndex('users_primary_email_normalized_uidx').on(table.primaryEmailNormalized),
    uniqueIndex('users_id_status_uidx').on(table.id, table.status),
    index('users_status_idx').on(table.status),
  ],
);
