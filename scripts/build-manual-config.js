/**
 * Assembles the manual fixture into `.manual-config/`, a folder that
 * `clasp push` can send to a throwaway, container-bound Apps Script project.
 *
 * Run through `npm run manual:build`, which compiles the library first. The
 * target project is read from MANUAL_CONFIG_SCRIPT_ID, so no ID is stored in
 * the repository. MANUAL_CONFIG_HOST (sheets, docs, slides or forms) picks the
 * host file, so the project asks for that host's scope only. The build fails if
 * the bundled peers name a host service, which would add its scope. See manual/README.md.
 */
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from 'gas-dev-bundle';
import { assertNoHostServices } from './host-services.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, '.manual-config');

const scriptId = process.env.MANUAL_CONFIG_SCRIPT_ID;
if (!scriptId) {
  console.error(
    'MANUAL_CONFIG_SCRIPT_ID is not set (the throwaway bound project).',
  );
  process.exit(1);
}

const HOSTS = ['sheets', 'docs', 'slides', 'forms'];
const host = process.env.MANUAL_CONFIG_HOST;
if (!HOSTS.includes(host)) {
  console.error(
    `MANUAL_CONFIG_HOST must be one of ${HOSTS.join(', ')} (the container type).`,
  );
  process.exit(1);
}

const { gasDevConfig } = JSON.parse(
  readFileSync(join(ROOT, 'package.json'), 'utf8'),
);

/** Writes `content` to `path` under the output folder, creating directories. */
function emit(path, content) {
  const target = join(OUT, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

/** Whether a compiled file holds nothing but comments, as type-only files do. */
function isEmpty(code) {
  return (
    code
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .trim() === ''
  );
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// Peers, bundled from their release tags as a consumer would.
const peerCode = bundle({ libraries: gasDevConfig.peers, cwd: ROOT }).code;
try {
  assertNoHostServices(peerCode);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
emit('lib/gas-libraries.js', peerCode);

// The compiled library, one file each, in load order. Type-only files compile
// to nothing and are left out.
const libraryFiles = [];
for (const file of gasDevConfig.loadOrder) {
  const compiled = file.replace(/\.ts$/, '.js');
  const code = readFileSync(join(ROOT, 'dist', compiled), 'utf8');
  if (isEmpty(code)) continue;

  const target = `lib/gas-config/${compiled}`;
  emit(target, code);
  libraryFiles.push(target);
}

cpSync(join(ROOT, `manual/hosts/${host}.js`), join(OUT, 'host.js'));
cpSync(join(ROOT, 'manual/app.js'), join(OUT, 'app.js'));
cpSync(join(ROOT, 'manual/appsscript.json'), join(OUT, 'appsscript.json'));

const pushOrder = [
  'lib/gas-libraries.js',
  ...libraryFiles,
  'host.js',
  'app.js',
];
emit(
  '.clasp.json',
  `${JSON.stringify({ scriptId, rootDir: '.', filePushOrder: pushOrder }, null, 2)}\n`,
);

// Apps Script rejects a file that does not parse, but only on push.
for (const file of pushOrder) {
  execFileSync(process.execPath, ['--check', join(OUT, file)]);
}

console.log(`✓ Built ${OUT}\n  Next: cd .manual-config && npx clasp push`);
