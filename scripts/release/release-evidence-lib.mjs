export const GATE_DEFINITIONS = Object.freeze({
  source_revision: { title: 'Immutable source revision', nonWaivable: true },
  phase_dependency_consistency: {
    title: 'P1 -> P2 -> P3 dependency consistency',
    nonWaivable: true,
  },
  quality_gates: {
    title: 'Format, lint, type, test, integration, and build gates',
    nonWaivable: true,
  },
  dependency_scan: { title: 'Production dependency vulnerability scan', nonWaivable: true },
  container_scan: { title: 'Built API/worker container scan', nonWaivable: true },
  tenant_authorization: { title: 'Tenant isolation and authorization audit', nonWaivable: true },
  critical_high_security: { title: 'Critical/high security findings resolved', nonWaivable: true },
  migration_compatibility: {
    title: 'Additive migration and compatibility review',
    nonWaivable: true,
  },
  backup_snapshot: { title: 'Pre-release database and object inventory backup', nonWaivable: true },
  isolated_restore_drill: { title: 'Isolated restore drill within RTO/RPO', nonWaivable: true },
  rollback_plan: {
    title: 'Revision-specific application and data rollback plan',
    nonWaivable: true,
  },
  load_test: { title: '75-concurrent representative load test', nonWaivable: true },
  soak_test: { title: 'Representative soak test', nonWaivable: false },
  observability_alerts: {
    title: 'Logs, Sentry, uptime, queue, and webhook alerts',
    nonWaivable: true,
  },
  provider_readiness: {
    title: 'Approved provider credentials and production callbacks',
    nonWaivable: false,
    allowNotApplicable: true,
  },
  ai_social_human_approval: {
    title: 'Human approval for enabled AI/social workflows',
    nonWaivable: false,
    allowNotApplicable: true,
  },
  mobile_release: { title: 'Signed staged mobile release and revocation test', nonWaivable: true },
  critical_journey: {
    title: 'Full CRM critical journey in production-like staging',
    nonWaivable: true,
  },
  pilot_acceptance: { title: 'Named one-dealership pilot acceptance', nonWaivable: false },
  release_signoff: {
    title: 'Product, engineering, operations, and security signoff',
    nonWaivable: true,
  },
});

const TERMINAL_PASS_STATUSES = new Set(['VERIFIED', 'WAIVED', 'NOT_APPLICABLE']);
const PLACEHOLDER_PATTERN =
  /(?:\bTBD\b|\bTODO\b|placeholder|not[- ]?verified|example\.com|<[^>]+>)/i;

export function validateReleaseEvidence(document, now = new Date()) {
  const errors = [];
  const warnings = [];

  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return noGo([{ code: 'document.invalid', message: 'Evidence must be a JSON object.' }]);
  }

  if (document.schemaVersion !== 1)
    error(errors, 'schemaVersion.invalid', 'schemaVersion must equal 1.');
  requireText(document.releaseId, 'releaseId', errors);
  requireText(document.applicationVersion, 'applicationVersion', errors);
  requireText(document.evidenceOwner, 'evidenceOwner', errors);
  if (document.environment !== 'production') {
    error(
      errors,
      'environment.invalid',
      'environment must equal production for a release decision.',
    );
  }
  if (typeof document.commitSha !== 'string' || !/^[a-f\d]{7,40}$/i.test(document.commitSha)) {
    error(errors, 'commitSha.invalid', 'commitSha must be a 7-40 character Git SHA.');
  }
  requireIsoDate(document.createdAt, 'createdAt', errors);

  const gates = document.gates;
  if (!gates || typeof gates !== 'object' || Array.isArray(gates)) {
    error(errors, 'gates.invalid', 'gates must be an object.');
  } else {
    for (const [gateName, definition] of Object.entries(GATE_DEFINITIONS)) {
      validateGate(gateName, definition, gates[gateName], errors, now);
    }

    for (const extraGate of Object.keys(gates).filter((name) => !(name in GATE_DEFINITIONS))) {
      warnings.push({
        code: 'gate.unknown',
        gate: extraGate,
        message: `Unknown gate: ${extraGate}.`,
      });
    }
  }

  const passedGates =
    gates && typeof gates === 'object'
      ? Object.entries(GATE_DEFINITIONS)
          .filter(
            ([name]) =>
              TERMINAL_PASS_STATUSES.has(gates[name]?.status) &&
              !errors.some((entry) => entry.gate === name),
          )
          .map(([name]) => name)
      : [];

  return {
    schemaVersion: 1,
    kind: 'go-digital-crm-release-evidence-validation',
    decision: errors.length === 0 ? 'GO' : 'NO-GO',
    releaseId: typeof document.releaseId === 'string' ? document.releaseId : null,
    commitSha: typeof document.commitSha === 'string' ? document.commitSha : null,
    checkedAt: now.toISOString(),
    gates: {
      required: Object.keys(GATE_DEFINITIONS).length,
      terminalPass: passedGates.length,
      passing: passedGates,
    },
    errors,
    warnings,
  };
}

function validateGate(name, definition, gate, errors, now) {
  if (!gate || typeof gate !== 'object' || Array.isArray(gate)) {
    error(errors, 'gate.missing', `${definition.title} is missing.`, name);
    return;
  }

  const status = gate.status;
  if (!['VERIFIED', 'WAIVED', 'NOT_APPLICABLE', 'NOT_VERIFIED', 'FAILED'].includes(status)) {
    error(errors, 'gate.status.invalid', `${definition.title} has an invalid status.`, name);
    return;
  }
  if (status === 'NOT_VERIFIED' || status === 'FAILED') {
    error(errors, 'gate.not_passing', `${definition.title} is ${status}.`, name);
    return;
  }

  if (status === 'VERIFIED') {
    requireText(gate.verifiedBy, `${name}.verifiedBy`, errors, name);
    requireIsoDate(gate.verifiedAt, `${name}.verifiedAt`, errors, name);
    validateEvidenceReferences(gate.evidence, name, errors);
    return;
  }

  if (status === 'NOT_APPLICABLE') {
    if (!definition.allowNotApplicable) {
      error(
        errors,
        'gate.not_applicable.disallowed',
        `${definition.title} cannot be NOT_APPLICABLE.`,
        name,
      );
      return;
    }
    requireText(gate.approvedBy, `${name}.approvedBy`, errors, name);
    requireIsoDate(gate.approvedAt, `${name}.approvedAt`, errors, name);
    requireText(gate.rationale, `${name}.rationale`, errors, name);
    validateEvidenceReferences(gate.evidence, name, errors);
    return;
  }

  if (definition.nonWaivable) {
    error(errors, 'gate.waiver.disallowed', `${definition.title} is non-waivable.`, name);
    return;
  }
  const waiver = gate.waiver;
  if (!waiver || typeof waiver !== 'object' || Array.isArray(waiver)) {
    error(errors, 'gate.waiver.missing', `${definition.title} needs a waiver object.`, name);
    return;
  }
  requireText(waiver.approvedBy, `${name}.waiver.approvedBy`, errors, name);
  requireText(waiver.rationale, `${name}.waiver.rationale`, errors, name);
  requireIsoDate(waiver.approvedAt, `${name}.waiver.approvedAt`, errors, name);
  requireIsoDate(waiver.expiresAt, `${name}.waiver.expiresAt`, errors, name);
  const expiresAt = Date.parse(waiver.expiresAt);
  if (Number.isFinite(expiresAt) && expiresAt <= now.getTime()) {
    error(errors, 'gate.waiver.expired', `${definition.title} has an expired waiver.`, name);
  }
  validateEvidenceReferences(gate.evidence, name, errors);
}

function validateEvidenceReferences(references, gate, errors) {
  if (!Array.isArray(references) || references.length === 0) {
    error(errors, 'gate.evidence.missing', 'At least one evidence reference is required.', gate);
    return;
  }
  if (
    references.some(
      (reference) =>
        typeof reference !== 'string' || !reference.trim() || PLACEHOLDER_PATTERN.test(reference),
    )
  ) {
    error(
      errors,
      'gate.evidence.placeholder',
      'Evidence references must be concrete artifact paths, run IDs, tickets, or immutable URLs.',
      gate,
    );
  }
}

function requireText(value, field, errors, gate) {
  if (typeof value !== 'string' || value.trim().length < 3 || PLACEHOLDER_PATTERN.test(value)) {
    error(errors, 'field.required', `${field} must contain a concrete value.`, gate);
  }
}

function requireIsoDate(value, field, errors, gate) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    error(errors, 'field.date.invalid', `${field} must be an ISO-8601 timestamp.`, gate);
  }
}

function error(errors, code, message, gate) {
  errors.push({ code, ...(gate ? { gate } : {}), message });
}

function noGo(errors) {
  return {
    schemaVersion: 1,
    kind: 'go-digital-crm-release-evidence-validation',
    decision: 'NO-GO',
    releaseId: null,
    commitSha: null,
    checkedAt: new Date().toISOString(),
    gates: { required: Object.keys(GATE_DEFINITIONS).length, terminalPass: 0, passing: [] },
    errors,
    warnings: [],
  };
}
