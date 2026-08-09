ALTER TABLE "call_recordings" ADD CONSTRAINT "call_recordings_client_call_id_unique" UNIQUE("client_organization_id","call_id","id");
--> statement-breakpoint
ALTER TABLE "call_transcript_suggestions" DROP CONSTRAINT "call_transcript_recording_fk";
--> statement-breakpoint
ALTER TABLE "call_transcript_suggestions" ADD CONSTRAINT "call_transcript_recording_call_tenant_fk" FOREIGN KEY ("client_organization_id","call_id","recording_id") REFERENCES "public"."call_recordings"("client_organization_id","call_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
INSERT INTO "permissions" ("code", "description") VALUES
  ('reports.read', 'Read authoritative, scope-filtered operational KPI dashboards and reports.'),
  ('reports.export', 'Create and download tenant-scoped, expiring report exports.'),
  ('audit.events.read', 'Search immutable tenant audit events with sensitive values minimized.'),
  ('integrations.read', 'Read tenant provider state and onboarding progress without credentials.'),
  ('integrations.manage', 'Configure, test, rotate or disconnect tenant provider connections.'),
  ('onboarding.manage', 'Record audited client onboarding checklist evidence.'),
  ('ai.creatives.manage', 'Request and inspect private AI creative assets.'),
  ('ai.creatives.review', 'Approve or reject moderated creative assets before publishing.'),
  ('ai.transcripts.manage', 'Create and inspect AI transcript and CRM-change suggestions.'),
  ('ai.transcripts.review', 'Accept or reject AI suggestions; never silently update CRM data.'),
  ('social.publish', 'Publish only human-approved assets through granted official APIs.')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";
--> statement-breakpoint
INSERT INTO "role_permission_mappings" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."code" IN ('AGENCY_ADMIN', 'CLIENT_ADMIN', 'MANAGER', 'SALES_MANAGER', 'TEAM_MANAGER')
  AND p."code" IN (
    'reports.read', 'reports.export',
    'integrations.read', 'integrations.manage', 'onboarding.manage',
    'ai.creatives.manage', 'ai.creatives.review',
    'ai.transcripts.manage', 'ai.transcripts.review', 'social.publish'
  )
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permission_mappings" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."code" IN ('AGENCY_ADMIN', 'CLIENT_ADMIN', 'MANAGER', 'SALES_MANAGER')
  AND p."code" = 'audit.events.read'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
DELETE FROM "role_permission_mappings" rpm
USING "roles" r, "permissions" p
WHERE rpm."role_id" = r."id"
  AND rpm."permission_id" = p."id"
  AND r."code" = 'TEAM_MANAGER'
  AND p."code" = 'audit.events.read';
