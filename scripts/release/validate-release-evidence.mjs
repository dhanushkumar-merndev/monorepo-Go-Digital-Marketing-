#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateReleaseEvidence } from './release-evidence-lib.mjs';

export async function main(argv = process.argv.slice(2)) {
  let input;
  let output;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help') {
      help = true;
    } else if (argument === '--output') {
      output = argv[index + 1];
      if (!output || output.startsWith('--')) throw new Error('--output requires a path.');
      index += 1;
    } else if (argument.startsWith('--')) {
      throw new Error(`Unknown option: ${argument}`);
    } else if (input) {
      throw new Error(`Unexpected additional input: ${argument}`);
    } else {
      input = argument;
    }
  }

  if (help || !input) {
    process.stdout.write(
      'Usage: node scripts/release/validate-release-evidence.mjs EVIDENCE.json [--output RESULT.json]\n',
    );
    return help ? 0 : 1;
  }

  const document = JSON.parse(await readFile(resolve(input), 'utf8'));
  const result = validateReleaseEvidence(document);
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  if (output) await writeFile(resolve(output), serialized, { encoding: 'utf8', flag: 'wx' });
  process.stdout.write(serialized);
  return result.decision === 'GO' ? 0 : 1;
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
