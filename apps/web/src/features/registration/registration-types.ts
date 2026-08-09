import type { RegistrationStatus } from '@gdm/contracts';

export interface RegistrationCaseSummary {
  aging: { age_hours: number; overdue: boolean; sla_hours: number };
  application_number: string | null;
  assigned_membership_id: string | null;
  assigned_name: string | null;
  booking_id: string;
  booking_reference: string;
  branch_id: string;
  contact_id: string;
  customer_name: string;
  expected_completion_at: string | null;
  id: string;
  inventory_unit_id: string;
  permanent_registration_number: string | null;
  phone_e164: string;
  rto_code: string | null;
  rto_name: string | null;
  status: RegistrationStatus;
  status_changed_at: string;
  temporary_registration_number: string | null;
  vehicle_label: string;
  version: number;
}

export interface RegistrationDetailResponse {
  case: RegistrationCaseSummary;
  delivery: { delivered_at: string | null; id: string; status: string } | null;
  documents: {
    created_at: string;
    file_name: string;
    id: string;
    review_reason: string | null;
    reviewed_at: string | null;
    scanner_status: string | null;
    status: string;
    uploaded_at: string | null;
  }[];
  events: {
    actor_name: string;
    corrects_event_id: string | null;
    created_at: string;
    event_type: string;
    evidence: Record<string, unknown>;
    from_status: string | null;
    id: string;
    reason: string | null;
    to_status: string;
  }[];
  rc_delivery_records: {
    delivered_at: string;
    delivery_mode: string;
    id: string;
    rc_document_id: string;
    recipient: string;
  }[];
}

export interface CustomerVehicle {
  amc_expires_on: string | null;
  booking_id: string | null;
  branch_id: string;
  brand_name: string;
  contact_id: string;
  customer_name: string | null;
  delivery_date: string | null;
  delivery_job_id: string | null;
  engine_number: string | null;
  id: string;
  insurance_expires_on: string | null;
  insurance_policy_number: string | null;
  model_name: string;
  ownership_source: 'DEALERSHIP_SALE' | 'EXTERNAL';
  purchase_date: string | null;
  registration_case_id: string | null;
  registration_number: string | null;
  rsa_expires_on: string | null;
  variant_name: string;
  version: number;
  vin: string | null;
  warranty_expires_on: string | null;
}

export const commandHeaders = (): HeadersInit => ({
  'content-type': 'application/json',
  'idempotency-key': crypto.randomUUID(),
});

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The request could not be completed.';
}
