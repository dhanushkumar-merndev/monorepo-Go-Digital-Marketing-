import type { LeadStatus } from '@gdm/contracts';

const acceptedActive: LeadStatus[] = [
  'ACCEPTED',
  'CONTACTED',
  'INTERESTED',
  'FOLLOW_UP',
  'SHOWROOM_VISIT',
  'TEST_RIDE_REQUESTED',
  'TEST_RIDE_BOOKED',
  'TEST_RIDE_COMPLETED',
  'NEGOTIATION',
];

export const leadTransitions: Readonly<Record<LeadStatus, readonly LeadStatus[]>> = {
  NEW: ['PENDING_REVIEW'],
  PENDING_REVIEW: ['CONTACT_ATTEMPT', 'ACCEPTED', 'REJECTED'],
  CONTACT_ATTEMPT: ['ACCEPTED', 'REJECTED'],
  ACCEPTED: ['CONTACTED', 'INTERESTED', 'FOLLOW_UP', 'NEGOTIATION', 'LOST'],
  REJECTED: ['REOPENED'],
  CONTACTED: ['INTERESTED', 'FOLLOW_UP', 'NEGOTIATION', 'LOST'],
  INTERESTED: ['FOLLOW_UP', 'SHOWROOM_VISIT', 'TEST_RIDE_REQUESTED', 'NEGOTIATION', 'LOST'],
  FOLLOW_UP: [
    'CONTACTED',
    'INTERESTED',
    'SHOWROOM_VISIT',
    'TEST_RIDE_REQUESTED',
    'NEGOTIATION',
    'LOST',
  ],
  SHOWROOM_VISIT: ['TEST_RIDE_REQUESTED', 'NEGOTIATION', 'LOST'],
  TEST_RIDE_REQUESTED: ['TEST_RIDE_BOOKED', 'NEGOTIATION', 'LOST'],
  TEST_RIDE_BOOKED: ['TEST_RIDE_COMPLETED', 'LOST'],
  TEST_RIDE_COMPLETED: ['NEGOTIATION', 'LOST'],
  NEGOTIATION: ['BOOKING_CONFIRMED', 'LOST'],
  BOOKING_CONFIRMED: [],
  LOST: ['REOPENED'],
  REOPENED: ['ACCEPTED'],
};

export function isAllowedLeadTransition(from: LeadStatus, to: LeadStatus): boolean {
  return leadTransitions[from].includes(to);
}

export function isAcceptedActiveStatus(status: LeadStatus): boolean {
  return acceptedActive.includes(status);
}

export function requiresNextAction(status: LeadStatus): boolean {
  return isAcceptedActiveStatus(status) || status === 'REOPENED';
}
