export interface ReminderRule {
  id: string;
  reminder_type: string;
  category: 'OPERATIONAL' | 'MARKETING';
  channel: string;
  thresholdKind: 'DATE' | 'KILOMETRE';
  brandName: string | null;
  modelName: string | null;
  variantName: string | null;
  modelYear: number | null;
  dueAfterDays: number | null;
  dueKilometres: number | null;
  noticeDays: number[];
  template_name: string;
  template_status: string;
}

export interface ReminderPlan {
  active: boolean;
  category: string;
  contact_name: string;
  due_at: string | null;
  due_kilometres: number | null;
  id: string;
  reminder_type: string;
  schedule_version: number;
  vehicle: string;
  vehicle_id: string;
}

export interface ReminderInstance {
  category: string;
  channel: string;
  contact_name: string;
  id: string;
  reminder_type: string;
  retry_count: number;
  scheduled_for: string;
  status: string;
  suppression_reason: string | null;
  vehicle: string;
  vehicle_id: string;
  version: number;
}

export function commandHeaders(): Record<string, string> {
  return { 'Idempotency-Key': crypto.randomUUID() };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The reminder request could not be completed.';
}
