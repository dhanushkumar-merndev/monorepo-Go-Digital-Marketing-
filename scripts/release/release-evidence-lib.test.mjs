import assert from 'node:assert/strict';
import test from 'node:test';
import { GATE_DEFINITIONS, validateReleaseEvidence } from './release-evidence-lib.mjs';

const now = new Date('2026-08-09T12:00:00.000Z');

function verifiedDocument() {
  return {
    schemaVersion: 1,
    releaseId: 'release-2026-08-09-001',
    applicationVersion: '1.0.0',
    commitSha: '0123456789abcdef0123456789abcdef01234567',
    environment: 'production',
    createdAt: '2026-08-09T10:00:00.000Z',
    evidenceOwner: 'Release Manager',
    gates: Object.fromEntries(
      Object.keys(GATE_DEFINITIONS).map((gate) => [
        gate,
        {
          status: 'VERIFIED',
          verifiedBy: 'Independent Reviewer',
          verifiedAt: '2026-08-09T11:00:00.000Z',
          evidence: [`artifact://release-2026-08-09-001/${gate}`],
        },
      ]),
    ),
  };
}

test('a complete concrete evidence document receives GO', () => {
  const result = validateReleaseEvidence(verifiedDocument(), now);
  assert.equal(result.decision, 'GO');
  assert.equal(result.errors.length, 0);
  assert.equal(result.gates.terminalPass, Object.keys(GATE_DEFINITIONS).length);
});

test('NOT_VERIFIED always yields NO-GO', () => {
  const document = verifiedDocument();
  document.gates.load_test = { status: 'NOT_VERIFIED' };
  const result = validateReleaseEvidence(document, now);
  assert.equal(result.decision, 'NO-GO');
  assert.ok(result.errors.some((entry) => entry.gate === 'load_test'));
});

test('non-waivable security evidence cannot be waived', () => {
  const document = verifiedDocument();
  document.gates.critical_high_security = {
    status: 'WAIVED',
    evidence: ['ticket://SEC-1234'],
    waiver: {
      approvedBy: 'Security Owner',
      rationale: 'Risk temporarily accepted',
      approvedAt: '2026-08-09T11:00:00.000Z',
      expiresAt: '2026-08-10T11:00:00.000Z',
    },
  };
  const result = validateReleaseEvidence(document, now);
  assert.equal(result.decision, 'NO-GO');
  assert.ok(result.errors.some((entry) => entry.code === 'gate.waiver.disallowed'));
});

test('feature-disabled provider integrations may be NOT_APPLICABLE with evidence', () => {
  const document = verifiedDocument();
  document.gates.provider_readiness = {
    status: 'NOT_APPLICABLE',
    approvedBy: 'Product and Security Owners',
    approvedAt: '2026-08-09T11:00:00.000Z',
    rationale: 'Every official provider feature flag is disabled for this release.',
    evidence: ['artifact://release-2026-08-09-001/provider-feature-flags'],
  };
  const result = validateReleaseEvidence(document, now);
  assert.equal(result.decision, 'GO');
});

test('placeholder references cannot satisfy a verified gate', () => {
  const document = verifiedDocument();
  document.gates.mobile_release.evidence = ['TODO'];
  const result = validateReleaseEvidence(document, now);
  assert.equal(result.decision, 'NO-GO');
  assert.ok(result.errors.some((entry) => entry.code === 'gate.evidence.placeholder'));
});
