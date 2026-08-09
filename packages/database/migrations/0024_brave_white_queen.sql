CREATE TYPE "public"."booking_payment_type" AS ENUM('FULL', 'PARTIAL', 'FINANCE', 'INSTALLMENT', 'MIXED');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('DRAFT', 'CONFIRMED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."commercial_approval_status" AS ENUM('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."commercial_document_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'SUPERSEDED');--> statement-breakpoint
CREATE TYPE "public"."commercial_document_upload_status" AS ENUM('PENDING_UPLOAD', 'UPLOADED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."exchange_case_status" AS ENUM('REQUESTED', 'ACCEPTED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."finance_case_status" AS ENUM('APPLIED', 'APPROVED', 'REJECTED', 'DISBURSED');--> statement-breakpoint
CREATE TYPE "public"."insurance_payment_status" AS ENUM('PENDING', 'PAID', 'NOT_APPLICABLE');--> statement-breakpoint
CREATE TYPE "public"."payment_entry_kind" AS ENUM('PAYMENT', 'REVERSAL');--> statement-breakpoint
CREATE TYPE "public"."payment_entry_status" AS ENUM('PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'REVERSED');--> statement-breakpoint
CREATE TYPE "public"."quotation_status" AS ENUM('DRAFT', 'ACTIVE', 'SUPERSEDED', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "booking_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"code" varchar(64) NOT NULL,
	"description" varchar(240) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"amount_minor" bigint NOT NULL,
	CONSTRAINT "booking_items_quantity_check" CHECK ("booking_items"."quantity" >= 1),
	CONSTRAINT "booking_items_amount_check" CHECK ("booking_items"."amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"quotation_id" uuid NOT NULL,
	"quotation_version" integer NOT NULL,
	"booking_reference" varchar(120) NOT NULL,
	"status" "booking_status" DEFAULT 'CONFIRMED' NOT NULL,
	"payment_type" "booking_payment_type" NOT NULL,
	"currency" varchar(3) NOT NULL,
	"payable_minor" bigint NOT NULL,
	"selected_inventory_unit_id" uuid,
	"expected_delivery_at" timestamp with time zone,
	"customer_confirmed_at" timestamp with time zone NOT NULL,
	"cancellation_reason" text,
	"refund_settlement_note" text,
	"cancellation_notification_decision" text,
	"cancelled_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "bookings_payable_check" CHECK ("bookings"."payable_minor" >= 0),
	CONSTRAINT "bookings_version_check" CHECK ("bookings"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "commercial_command_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"command_type" varchar(100) NOT NULL,
	"request_fingerprint" varchar(64) NOT NULL,
	"response_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commercial_document_download_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"document_version_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"correlation_id" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commercial_document_verification_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"document_version_id" uuid NOT NULL,
	"from_status" "commercial_document_status",
	"to_status" "commercial_document_status" NOT NULL,
	"reason" text NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commercial_document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"object_key" text NOT NULL,
	"file_name" varchar(240) NOT NULL,
	"content_type" varchar(120) NOT NULL,
	"content_length" bigint NOT NULL,
	"checksum_sha256" varchar(64),
	"upload_status" "commercial_document_upload_status" DEFAULT 'PENDING_UPLOAD' NOT NULL,
	"scan_status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"uploader_membership_id" uuid NOT NULL,
	"uploaded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_document_versions_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "commercial_document_versions_number_unique" UNIQUE("client_organization_id","document_id","version"),
	CONSTRAINT "commercial_document_versions_length_check" CHECK ("commercial_document_versions"."content_length" > 0 and "commercial_document_versions"."content_length" <= 20971520)
);
--> statement-breakpoint
CREATE TABLE "commercial_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"document_type" varchar(64) NOT NULL,
	"status" "commercial_document_status" DEFAULT 'PENDING' NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"preferred_delivery_channel" varchar(32),
	"expires_at" timestamp with time zone,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_documents_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "commercial_documents_version_check" CHECK ("commercial_documents"."current_version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "commercial_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"invoice_number" varchar(160) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"amount_minor" bigint NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_invoices_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "commercial_invoices_amount_check" CHECK ("commercial_invoices"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "commercial_settings" (
	"client_organization_id" uuid PRIMARY KEY NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"discount_approval_threshold_minor" bigint NOT NULL,
	"delivery_payment_gate_basis_points" integer NOT NULL,
	"require_finance_disbursement" boolean DEFAULT true NOT NULL,
	"require_invoice" boolean DEFAULT true NOT NULL,
	"require_insurance" boolean DEFAULT true NOT NULL,
	"required_document_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_membership_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_settings_discount_check" CHECK ("commercial_settings"."discount_approval_threshold_minor" >= 0),
	CONSTRAINT "commercial_settings_payment_gate_check" CHECK ("commercial_settings"."delivery_payment_gate_basis_points" between 0 and 10000),
	CONSTRAINT "commercial_settings_version_check" CHECK ("commercial_settings"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "delivery_readiness_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"ready" boolean NOT NULL,
	"items" jsonb NOT NULL,
	"evaluated_by_membership_id" uuid,
	"correlation_id" varchar(128) NOT NULL,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discount_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"quotation_id" uuid NOT NULL,
	"quotation_version" integer NOT NULL,
	"discount_minor" bigint NOT NULL,
	"threshold_minor" bigint NOT NULL,
	"status" "commercial_approval_status" DEFAULT 'PENDING' NOT NULL,
	"requested_by_membership_id" uuid NOT NULL,
	"decided_by_membership_id" uuid,
	"reason" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "discount_approvals_version_unique" UNIQUE("client_organization_id","quotation_id","quotation_version")
);
--> statement-breakpoint
CREATE TABLE "exchange_case_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"exchange_case_id" uuid NOT NULL,
	"from_status" "exchange_case_status",
	"to_status" "exchange_case_status" NOT NULL,
	"amount_minor" bigint,
	"reason" text,
	"actor_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchange_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"make_model" varchar(240) NOT NULL,
	"registration_number" varchar(64) NOT NULL,
	"year" integer NOT NULL,
	"odometer_km" integer NOT NULL,
	"ownership_name" varchar(200) NOT NULL,
	"expected_price_minor" bigint NOT NULL,
	"evaluated_price_minor" bigint,
	"status" "exchange_case_status" DEFAULT 'REQUESTED' NOT NULL,
	"decision_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"decided_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_cases_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "exchange_cases_values_check" CHECK ("exchange_cases"."year" between 1900 and 2200 and "exchange_cases"."odometer_km" >= 0 and "exchange_cases"."expected_price_minor" >= 0 and coalesce("exchange_cases"."evaluated_price_minor", 0) >= 0 and "exchange_cases"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "finance_case_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"finance_case_id" uuid NOT NULL,
	"from_status" "finance_case_status",
	"to_status" "finance_case_status" NOT NULL,
	"provider_reference" varchar(160),
	"amount_minor" bigint,
	"reason" text,
	"actor_membership_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"partner_name" varchar(200) NOT NULL,
	"provider_reference" varchar(160),
	"currency" varchar(3) NOT NULL,
	"applied_amount_minor" bigint NOT NULL,
	"down_payment_minor" bigint NOT NULL,
	"sanctioned_amount_minor" bigint,
	"disbursed_amount_minor" bigint,
	"status" "finance_case_status" DEFAULT 'APPLIED' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_cases_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "finance_cases_amounts_check" CHECK ("finance_cases"."applied_amount_minor" > 0 and "finance_cases"."down_payment_minor" >= 0 and coalesce("finance_cases"."sanctioned_amount_minor", 0) >= 0 and coalesce("finance_cases"."disbursed_amount_minor", 0) >= 0),
	CONSTRAINT "finance_cases_version_check" CHECK ("finance_cases"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "insurance_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"insurer_name" varchar(200) NOT NULL,
	"quote_reference" varchar(160) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"premium_minor" bigint NOT NULL,
	"payment_status" "insurance_payment_status" NOT NULL,
	"policy_generated" boolean DEFAULT false NOT NULL,
	"policy_number" varchar(160),
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "insurance_cases_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "insurance_cases_premium_check" CHECK ("insurance_cases"."premium_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payment_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"kind" "payment_entry_kind" DEFAULT 'PAYMENT' NOT NULL,
	"original_entry_id" uuid,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"method" varchar(32) NOT NULL,
	"payment_reference" varchar(160) NOT NULL,
	"proof_document_version_id" uuid,
	"received_at" timestamp with time zone NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_entries_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "payment_entries_amount_check" CHECK ("payment_entries"."amount_minor" > 0),
	CONSTRAINT "payment_entries_original_check" CHECK (("payment_entries"."kind" = 'PAYMENT' and "payment_entries"."original_entry_id" is null) or ("payment_entries"."kind" = 'REVERSAL' and "payment_entries"."original_entry_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "payment_verification_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"payment_entry_id" uuid NOT NULL,
	"from_status" "payment_entry_status",
	"to_status" "payment_entry_status" NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotation_price_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"quotation_version_id" uuid NOT NULL,
	"code" varchar(64) NOT NULL,
	"label" varchar(160) NOT NULL,
	"category" varchar(32) NOT NULL,
	"amount_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotation_components_amount_check" CHECK ("quotation_price_components"."amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "quotation_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"quotation_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"total_minor" bigint NOT NULL,
	"discount_minor" bigint NOT NULL,
	"payable_minor" bigint NOT NULL,
	"vehicle_configuration" text NOT NULL,
	"notes" text,
	"reason" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotation_versions_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "quotation_versions_number_unique" UNIQUE("client_organization_id","quotation_id","version"),
	CONSTRAINT "quotation_versions_amounts_check" CHECK (
      "quotation_versions"."total_minor" >= 0 and "quotation_versions"."discount_minor" >= 0 and "quotation_versions"."payable_minor" >= 0
      and "quotation_versions"."payable_minor" = "quotation_versions"."total_minor" - "quotation_versions"."discount_minor"
    )
);
--> statement-breakpoint
CREATE TABLE "quotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"quotation_reference" varchar(120) NOT NULL,
	"status" "quotation_status" DEFAULT 'DRAFT' NOT NULL,
	"approval_status" "commercial_approval_status" NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"currency" varchar(3) NOT NULL,
	"total_minor" bigint NOT NULL,
	"discount_minor" bigint NOT NULL,
	"payable_minor" bigint NOT NULL,
	"vehicle_configuration" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotations_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "quotations_amounts_check" CHECK (
      "quotations"."total_minor" >= 0 and "quotations"."discount_minor" >= 0 and "quotations"."payable_minor" >= 0
      and "quotations"."payable_minor" = "quotations"."total_minor" - "quotations"."discount_minor"
    ),
	CONSTRAINT "quotations_version_check" CHECK ("quotations"."current_version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "inventory_allocations" ADD COLUMN "booking_id" uuid;--> statement-breakpoint
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_booking_tenant_fk" FOREIGN KEY ("client_organization_id","booking_id") REFERENCES "public"."bookings"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_branch_tenant_fk" FOREIGN KEY ("client_organization_id","branch_id") REFERENCES "public"."branches"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_contact_tenant_fk" FOREIGN KEY ("client_organization_id","contact_id") REFERENCES "public"."contacts"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_lead_tenant_fk" FOREIGN KEY ("client_organization_id","lead_id") REFERENCES "public"."lead_opportunities"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_quotation_tenant_fk" FOREIGN KEY ("client_organization_id","quotation_id") REFERENCES "public"."quotations"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_inventory_unit_tenant_fk" FOREIGN KEY ("client_organization_id","selected_inventory_unit_id") REFERENCES "public"."inventory_units"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_creator_membership_tenant_fk" FOREIGN KEY ("client_organization_id","created_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_creator_user_membership_fk" FOREIGN KEY ("created_by_user_id","created_by_membership_id") REFERENCES "public"."memberships"("user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_command_receipts" ADD CONSTRAINT "commercial_command_receipts_client_fk" FOREIGN KEY ("client_organization_id") REFERENCES "public"."client_organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_document_download_events" ADD CONSTRAINT "commercial_document_downloads_document_tenant_fk" FOREIGN KEY ("client_organization_id","document_id") REFERENCES "public"."commercial_documents"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_document_download_events" ADD CONSTRAINT "commercial_document_downloads_version_tenant_fk" FOREIGN KEY ("client_organization_id","document_version_id") REFERENCES "public"."commercial_document_versions"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_document_download_events" ADD CONSTRAINT "commercial_document_downloads_actor_tenant_fk" FOREIGN KEY ("client_organization_id","actor_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_document_verification_events" ADD CONSTRAINT "commercial_document_verifications_document_tenant_fk" FOREIGN KEY ("client_organization_id","document_id") REFERENCES "public"."commercial_documents"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_document_verification_events" ADD CONSTRAINT "commercial_document_verifications_version_tenant_fk" FOREIGN KEY ("client_organization_id","document_version_id") REFERENCES "public"."commercial_document_versions"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_document_verification_events" ADD CONSTRAINT "commercial_document_verifications_actor_tenant_fk" FOREIGN KEY ("client_organization_id","actor_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_document_versions" ADD CONSTRAINT "commercial_document_versions_document_tenant_fk" FOREIGN KEY ("client_organization_id","document_id") REFERENCES "public"."commercial_documents"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_document_versions" ADD CONSTRAINT "commercial_document_versions_uploader_tenant_fk" FOREIGN KEY ("client_organization_id","uploader_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_documents" ADD CONSTRAINT "commercial_documents_booking_tenant_fk" FOREIGN KEY ("client_organization_id","booking_id") REFERENCES "public"."bookings"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_documents" ADD CONSTRAINT "commercial_documents_creator_tenant_fk" FOREIGN KEY ("client_organization_id","created_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_invoices" ADD CONSTRAINT "commercial_invoices_booking_tenant_fk" FOREIGN KEY ("client_organization_id","booking_id") REFERENCES "public"."bookings"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_invoices" ADD CONSTRAINT "commercial_invoices_creator_tenant_fk" FOREIGN KEY ("client_organization_id","created_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_settings" ADD CONSTRAINT "commercial_settings_client_fk" FOREIGN KEY ("client_organization_id") REFERENCES "public"."client_organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_settings" ADD CONSTRAINT "commercial_settings_actor_tenant_fk" FOREIGN KEY ("client_organization_id","updated_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_readiness_evaluations" ADD CONSTRAINT "delivery_readiness_booking_tenant_fk" FOREIGN KEY ("client_organization_id","booking_id") REFERENCES "public"."bookings"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_readiness_evaluations" ADD CONSTRAINT "delivery_readiness_actor_tenant_fk" FOREIGN KEY ("client_organization_id","evaluated_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_approvals" ADD CONSTRAINT "discount_approvals_quotation_tenant_fk" FOREIGN KEY ("client_organization_id","quotation_id") REFERENCES "public"."quotations"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_approvals" ADD CONSTRAINT "discount_approvals_requester_tenant_fk" FOREIGN KEY ("client_organization_id","requested_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_approvals" ADD CONSTRAINT "discount_approvals_decider_tenant_fk" FOREIGN KEY ("client_organization_id","decided_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_case_events" ADD CONSTRAINT "exchange_case_events_case_tenant_fk" FOREIGN KEY ("client_organization_id","exchange_case_id") REFERENCES "public"."exchange_cases"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_case_events" ADD CONSTRAINT "exchange_case_events_actor_tenant_fk" FOREIGN KEY ("client_organization_id","actor_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_cases" ADD CONSTRAINT "exchange_cases_booking_tenant_fk" FOREIGN KEY ("client_organization_id","booking_id") REFERENCES "public"."bookings"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_cases" ADD CONSTRAINT "exchange_cases_creator_tenant_fk" FOREIGN KEY ("client_organization_id","created_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_cases" ADD CONSTRAINT "exchange_cases_decider_tenant_fk" FOREIGN KEY ("client_organization_id","decided_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_case_events" ADD CONSTRAINT "finance_case_events_case_tenant_fk" FOREIGN KEY ("client_organization_id","finance_case_id") REFERENCES "public"."finance_cases"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_case_events" ADD CONSTRAINT "finance_case_events_actor_tenant_fk" FOREIGN KEY ("client_organization_id","actor_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_cases" ADD CONSTRAINT "finance_cases_booking_tenant_fk" FOREIGN KEY ("client_organization_id","booking_id") REFERENCES "public"."bookings"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_cases" ADD CONSTRAINT "finance_cases_creator_tenant_fk" FOREIGN KEY ("client_organization_id","created_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_cases" ADD CONSTRAINT "insurance_cases_booking_tenant_fk" FOREIGN KEY ("client_organization_id","booking_id") REFERENCES "public"."bookings"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_cases" ADD CONSTRAINT "insurance_cases_creator_tenant_fk" FOREIGN KEY ("client_organization_id","created_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_entries" ADD CONSTRAINT "payment_entries_booking_tenant_fk" FOREIGN KEY ("client_organization_id","booking_id") REFERENCES "public"."bookings"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_entries" ADD CONSTRAINT "payment_entries_original_tenant_fk" FOREIGN KEY ("client_organization_id","original_entry_id") REFERENCES "public"."payment_entries"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_entries" ADD CONSTRAINT "payment_entries_creator_tenant_fk" FOREIGN KEY ("client_organization_id","created_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_entries" ADD CONSTRAINT "payment_entries_creator_user_membership_fk" FOREIGN KEY ("created_by_user_id","created_by_membership_id") REFERENCES "public"."memberships"("user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_verification_events" ADD CONSTRAINT "payment_verification_events_entry_tenant_fk" FOREIGN KEY ("client_organization_id","payment_entry_id") REFERENCES "public"."payment_entries"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_verification_events" ADD CONSTRAINT "payment_verification_events_actor_tenant_fk" FOREIGN KEY ("client_organization_id","actor_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_price_components" ADD CONSTRAINT "quotation_components_version_tenant_fk" FOREIGN KEY ("client_organization_id","quotation_version_id") REFERENCES "public"."quotation_versions"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_versions" ADD CONSTRAINT "quotation_versions_quotation_tenant_fk" FOREIGN KEY ("client_organization_id","quotation_id") REFERENCES "public"."quotations"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_versions" ADD CONSTRAINT "quotation_versions_actor_tenant_fk" FOREIGN KEY ("client_organization_id","created_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_branch_tenant_fk" FOREIGN KEY ("client_organization_id","branch_id") REFERENCES "public"."branches"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_contact_tenant_fk" FOREIGN KEY ("client_organization_id","contact_id") REFERENCES "public"."contacts"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_lead_tenant_fk" FOREIGN KEY ("client_organization_id","lead_id") REFERENCES "public"."lead_opportunities"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_creator_membership_tenant_fk" FOREIGN KEY ("client_organization_id","created_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_creator_user_membership_fk" FOREIGN KEY ("created_by_user_id","created_by_membership_id") REFERENCES "public"."memberships"("user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_items_booking_code_uidx" ON "booking_items" USING btree ("client_organization_id","booking_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_client_reference_uidx" ON "bookings" USING btree ("client_organization_id","booking_reference");--> statement-breakpoint
CREATE INDEX "bookings_client_branch_status_idx" ON "bookings" USING btree ("client_organization_id","branch_id","status","created_at");--> statement-breakpoint
CREATE INDEX "bookings_lead_created_idx" ON "bookings" USING btree ("client_organization_id","lead_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_command_receipts_key_uidx" ON "commercial_command_receipts" USING btree ("client_organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "commercial_document_downloads_timeline_idx" ON "commercial_document_download_events" USING btree ("client_organization_id","document_id","created_at");--> statement-breakpoint
CREATE INDEX "commercial_document_verifications_timeline_idx" ON "commercial_document_verification_events" USING btree ("client_organization_id","document_id","created_at");--> statement-breakpoint
CREATE INDEX "commercial_documents_booking_type_idx" ON "commercial_documents" USING btree ("client_organization_id","booking_id","document_type","status");--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_invoices_number_uidx" ON "commercial_invoices" USING btree ("client_organization_id","invoice_number");--> statement-breakpoint
CREATE INDEX "delivery_readiness_timeline_idx" ON "delivery_readiness_evaluations" USING btree ("client_organization_id","booking_id","evaluated_at");--> statement-breakpoint
CREATE INDEX "discount_approvals_queue_idx" ON "discount_approvals" USING btree ("client_organization_id","status","requested_at");--> statement-breakpoint
CREATE UNIQUE INDEX "exchange_cases_active_booking_uidx" ON "exchange_cases" USING btree ("client_organization_id","booking_id") WHERE "exchange_cases"."status" = 'REQUESTED';--> statement-breakpoint
CREATE INDEX "finance_case_events_timeline_idx" ON "finance_case_events" USING btree ("client_organization_id","finance_case_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_cases_active_booking_uidx" ON "finance_cases" USING btree ("client_organization_id","booking_id") WHERE "finance_cases"."status" in ('APPLIED', 'APPROVED');--> statement-breakpoint
CREATE UNIQUE INDEX "insurance_cases_booking_uidx" ON "insurance_cases" USING btree ("client_organization_id","booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_entries_reference_uidx" ON "payment_entries" USING btree ("client_organization_id","payment_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_entries_one_reversal_uidx" ON "payment_entries" USING btree ("client_organization_id","original_entry_id") WHERE "payment_entries"."kind" = 'REVERSAL';--> statement-breakpoint
CREATE INDEX "payment_entries_booking_created_idx" ON "payment_entries" USING btree ("client_organization_id","booking_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_verification_events_timeline_idx" ON "payment_verification_events" USING btree ("client_organization_id","payment_entry_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "quotation_components_version_code_uidx" ON "quotation_price_components" USING btree ("client_organization_id","quotation_version_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "quotations_client_reference_uidx" ON "quotations" USING btree ("client_organization_id","quotation_reference");--> statement-breakpoint
CREATE INDEX "quotations_lead_created_idx" ON "quotations" USING btree ("client_organization_id","lead_id","created_at");--> statement-breakpoint
CREATE INDEX "inventory_allocations_booking_id_idx" ON "inventory_allocations" USING btree ("client_organization_id","booking_id");
--> statement-breakpoint
UPDATE "inventory_allocations" AS ia
SET "booking_id" = b."id"
FROM "bookings" AS b
WHERE ia."booking_id" IS NULL
  AND ia."client_organization_id" = b."client_organization_id"
  AND ia."booking_reference" = b."booking_reference";
--> statement-breakpoint
ALTER TABLE "inventory_allocations"
ADD CONSTRAINT "inventory_allocations_booking_tenant_fk"
FOREIGN KEY ("client_organization_id", "booking_id")
REFERENCES "public"."bookings"("client_organization_id", "id")
ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_entries"
ADD CONSTRAINT "payment_entries_proof_document_version_tenant_fk"
FOREIGN KEY ("client_organization_id", "proof_document_version_id")
REFERENCES "public"."commercial_document_versions"("client_organization_id", "id")
ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "permissions" ("code", "description") VALUES
  ('commercial.bookings.read', 'Read branch-scoped commercial bookings.'),
  ('commercial.bookings.manage', 'Create and update commercial bookings.'),
  ('commercial.bookings.cancel', 'Cancel bookings with required settlement evidence.'),
  ('commercial.quotations.manage', 'Create and revise versioned quotations.'),
  ('commercial.discounts.approve', 'Approve or reject above-threshold discounts.'),
  ('commercial.payments.record', 'Record pending customer payment entries.'),
  ('commercial.payments.verify', 'Verify or reject payment evidence.'),
  ('commercial.payments.correct', 'Create linked payment corrections and reversals.'),
  ('commercial.finance.manage', 'Manage finance approval and disbursement milestones.'),
  ('commercial.insurance.manage', 'Manage insurance policy and payment status.'),
  ('commercial.exchange.manage', 'Create customer vehicle exchange cases.'),
  ('commercial.exchange.approve', 'Approve or reject exchange valuations.'),
  ('commercial.invoices.manage', 'Record immutable commercial invoice references.'),
  ('commercial.documents.read', 'Read and download authorized private commercial documents.'),
  ('commercial.documents.upload', 'Upload private commercial documents.'),
  ('commercial.documents.verify', 'Approve or reject scanned commercial documents.'),
  ('commercial.readiness.read', 'Evaluate canonical delivery-readiness conditions.'),
  ('commercial.settings.manage', 'Manage tenant commercial thresholds and gates.')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";
--> statement-breakpoint
INSERT INTO "role_permission_mappings" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."code" IN ('AGENCY_ADMIN', 'CLIENT_ADMIN', 'MANAGER', 'SALES_MANAGER', 'TEAM_MANAGER')
  AND p."code" LIKE 'commercial.%'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permission_mappings" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."code" = 'SALESPERSON'
  AND p."code" IN (
    'commercial.bookings.read', 'commercial.bookings.manage',
    'commercial.quotations.manage', 'commercial.payments.record',
    'commercial.finance.manage', 'commercial.insurance.manage',
    'commercial.exchange.manage', 'commercial.documents.read',
    'commercial.documents.upload', 'commercial.readiness.read'
  )
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permission_mappings" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."code" = 'BILLING_DOCUMENTATION_EXECUTIVE'
  AND p."code" IN (
    'commercial.bookings.read', 'commercial.payments.record',
    'commercial.payments.verify', 'commercial.payments.correct',
    'commercial.finance.manage', 'commercial.insurance.manage',
    'commercial.invoices.manage', 'commercial.documents.read',
    'commercial.documents.upload', 'commercial.documents.verify',
    'commercial.readiness.read'
  )
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permission_mappings" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."code" IN ('INVENTORY_EXECUTIVE', 'DELIVERY_EXECUTIVE', 'RC_REGISTRATION_EXECUTIVE')
  AND p."code" IN ('commercial.bookings.read', 'commercial.documents.read', 'commercial.readiness.read')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_commercial_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'commercial history is append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER quotation_versions_immutable
BEFORE UPDATE OR DELETE ON "quotation_versions"
FOR EACH ROW EXECUTE FUNCTION prevent_commercial_history_mutation();
--> statement-breakpoint
CREATE TRIGGER quotation_price_components_immutable
BEFORE UPDATE OR DELETE ON "quotation_price_components"
FOR EACH ROW EXECUTE FUNCTION prevent_commercial_history_mutation();
--> statement-breakpoint
CREATE TRIGGER booking_items_immutable
BEFORE UPDATE OR DELETE ON "booking_items"
FOR EACH ROW EXECUTE FUNCTION prevent_commercial_history_mutation();
--> statement-breakpoint
CREATE TRIGGER payment_entries_immutable
BEFORE UPDATE OR DELETE ON "payment_entries"
FOR EACH ROW EXECUTE FUNCTION prevent_commercial_history_mutation();
--> statement-breakpoint
CREATE TRIGGER payment_verification_events_immutable
BEFORE UPDATE OR DELETE ON "payment_verification_events"
FOR EACH ROW EXECUTE FUNCTION prevent_commercial_history_mutation();
--> statement-breakpoint
CREATE TRIGGER finance_case_events_immutable
BEFORE UPDATE OR DELETE ON "finance_case_events"
FOR EACH ROW EXECUTE FUNCTION prevent_commercial_history_mutation();
--> statement-breakpoint
CREATE TRIGGER exchange_case_events_immutable
BEFORE UPDATE OR DELETE ON "exchange_case_events"
FOR EACH ROW EXECUTE FUNCTION prevent_commercial_history_mutation();
--> statement-breakpoint
CREATE TRIGGER commercial_invoices_immutable
BEFORE UPDATE OR DELETE ON "commercial_invoices"
FOR EACH ROW EXECUTE FUNCTION prevent_commercial_history_mutation();
--> statement-breakpoint
CREATE TRIGGER commercial_document_verification_events_immutable
BEFORE UPDATE OR DELETE ON "commercial_document_verification_events"
FOR EACH ROW EXECUTE FUNCTION prevent_commercial_history_mutation();
--> statement-breakpoint
CREATE TRIGGER commercial_document_download_events_immutable
BEFORE UPDATE OR DELETE ON "commercial_document_download_events"
FOR EACH ROW EXECUTE FUNCTION prevent_commercial_history_mutation();
--> statement-breakpoint
CREATE TRIGGER delivery_readiness_evaluations_immutable
BEFORE UPDATE OR DELETE ON "delivery_readiness_evaluations"
FOR EACH ROW EXECUTE FUNCTION prevent_commercial_history_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_commercial_document_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'commercial document versions cannot be deleted';
  END IF;
  IF OLD.upload_status <> 'PENDING_UPLOAD'
     OR NEW.client_organization_id <> OLD.client_organization_id
     OR NEW.document_id <> OLD.document_id
     OR NEW.version <> OLD.version
     OR NEW.object_key <> OLD.object_key
     OR NEW.file_name <> OLD.file_name
     OR NEW.content_type <> OLD.content_type
     OR NEW.content_length <> OLD.content_length
     OR NEW.uploader_membership_id <> OLD.uploader_membership_id THEN
    RAISE EXCEPTION 'uploaded commercial document versions are immutable';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER commercial_document_versions_mutation_guard
BEFORE UPDATE OR DELETE ON "commercial_document_versions"
FOR EACH ROW EXECUTE FUNCTION guard_commercial_document_version_mutation();
