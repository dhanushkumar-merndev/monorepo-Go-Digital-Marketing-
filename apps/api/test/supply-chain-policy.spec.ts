import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const rootPackage = JSON.parse(
  readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
) as { scripts: Record<string, string> };
const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
const ciWorkflow = readFileSync(
  new URL('../../../.github/workflows/ci.yml', import.meta.url),
  'utf8',
);
const dependabot = readFileSync(
  new URL('../../../.github/dependabot.yml', import.meta.url),
  'utf8',
);

const imageSizePeerAdvisories = ['GHSA-5p2g-fcmc-qvqq', 'GHSA-w3rx-r6r6-pgpr'];

function requiredScript(name: string): string {
  const script = rootPackage.scripts[name];
  assert.ok(script, `Missing root script: ${name}`);
  return script;
}

test('release dependency audit permits only the documented pruned peer advisories', () => {
  const rawAudit = requiredScript('security:audit:raw');
  const releaseAudit = requiredScript('security:audit:release');
  const exceptionAudit = requiredScript('security:audit:release:image-size-peer-exceptions');

  assert.match(rawAudit, /audit --prod --audit-level high --json/u);
  assert.doesNotMatch(rawAudit, /--ignore(?:-unfixable)?/u);
  assert.equal(releaseAudit, 'pnpm run security:audit:release:image-size-peer-exceptions');
  assert.doesNotMatch(exceptionAudit, /--ignore-unfixable/u);

  const ignoredAdvisories = [...exceptionAudit.matchAll(/--ignore (GHSA-[\w-]+)/gu)]
    .map((match) => match[1])
    .sort();
  assert.deepEqual(ignoredAdvisories, imageSizePeerAdvisories);
});

test('runtime image is pinned, non-root, and fails if image-size enters the pruned artifact', () => {
  const pinnedBaseImages = dockerfile.match(
    /^FROM node:[^\s]+@sha256:[a-f\d]{64}(?: AS \w+)?$/gimu,
  );
  assert.equal(pinnedBaseImages?.length, 2);
  assert.match(dockerfile, /find \/runtime\/node_modules -type d -name image-size/u);
  assert.match(dockerfile, /^USER api$/mu);
  assert.match(dockerfile, /org\.opencontainers\.image\.revision/u);
});

test('CI emits supply-chain evidence and smoke-tests both runtime entry points', () => {
  assert.match(ciWorkflow, /security:audit:raw/u);
  assert.match(ciWorkflow, /security:audit:release/u);
  assert.match(ciWorkflow, /image-size peer graph is absent/u);
  assert.match(ciWorkflow, /Smoke-test API container liveness and readiness/u);
  assert.match(ciWorkflow, /Smoke-test standalone worker process/u);
  assert.match(ciWorkflow, /anchore\/sbom-action@/u);
  assert.match(ciWorkflow, /aquasecurity\/trivy-action@/u);
  assert.match(ciWorkflow, /severity: CRITICAL,HIGH/u);
  assert.match(ciWorkflow, /ignore-unfixed: false/u);
  assert.match(ciWorkflow, /exit-code: 1/u);

  const actionReferences = [...ciWorkflow.matchAll(/^\s*uses:\s+[^@\s]+@([^\s#]+)/gmu)];
  assert.ok(actionReferences.length >= 6);
  for (const match of actionReferences) {
    const revision = match[1];
    assert.ok(revision);
    assert.match(revision, /^[a-f\d]{40}$/iu);
  }
});

test('Dependabot monitors the API Dockerfile', () => {
  assert.match(dependabot, /package-ecosystem: docker[\s\S]*directory: \/apps\/api/u);
});
