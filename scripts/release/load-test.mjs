#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import {
  assertSafeTarget,
  executeLoadTest,
  loadScenarios,
  parseArguments,
  writeSummary,
} from './load-lib.mjs';

export const HELP = `Usage:
  node scripts/release/load-test.mjs [options]

Options:
  --profile load|soak          60-second load or 15-minute soak defaults
  --base-url URL               Target API origin (default http://127.0.0.1:4000)
  --environment NAME           local, development, test, staging, or production
  --concurrency NUMBER         Concurrent workers (default 75)
  --duration SECONDS           Override profile duration
  --request-timeout-ms NUMBER  Per-request timeout (default 10000)
  --max-p95-ms NUMBER          Read-request p95 threshold (default 500)
  --max-error-rate RATE        Failure threshold from 0 to 1 (default 0.01)
  --minimum-requests NUMBER    Minimum valid sample (default 150)
  --scenarios FILE             JSON scenario array; defaults to representative reads
  --output FILE                Create a machine-readable JSON evidence file
  --allow-writes               Permit non-GET/HEAD scenarios against resettable data
  --allow-production           First half of the production safety latch
  --help                       Print this help

Environment:
  LOAD_TEST_BEARER_TOKEN             Test-user token for protected default scenarios
  LOAD_TEST_TARGET_CONFIRMATION      Exact remote non-production host, including port
  LOAD_TEST_PRODUCTION_CONFIRMATION  Exact production host; also needs --allow-production

The process exits non-zero if safety validation, a request threshold, or an evidence write fails.
Tokens and response bodies are never included in the result.`;

export async function main(argv = process.argv.slice(2), environment = process.env) {
  const options = parseArguments(argv, environment);
  if (options.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }

  assertSafeTarget(options);
  const scenarios = await loadScenarios(options);
  const summary = await executeLoadTest(options, scenarios);
  await writeSummary(options.outputFile, summary);
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  return summary.result === 'PASS' ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (exitCode) => {
      process.exitCode = exitCode;
    },
    (error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    },
  );
}
