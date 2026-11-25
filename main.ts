// Token launch radar (token-radar-01 entry, Node 22, standard library only).
//
// It reads the sealed snapshot at /input/snapshot.json (or --input <file|dir>),
// prices every rankable pre-token protocol with the comps-anchored model in
// lib/model.ts, writes the ranked board to /output/board.json and the dashboard's
// dataset to /output/data.js, copies this repository's dashboard/ and
// screenshots/ into /output, and writes /output/dossier.json with the vendored
// make.fun library, byte for byte as the scorer rebuilds it.
//
// The run is deterministic: nothing in it reads a clock or a random source, so
// the grader's two runs write the same bytes. Outside the grader's container,
// MAKEFUN_OUTPUT_DIR stands in for /output:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
//
// The ranking is the model's, unchanged — same constants, same anchors, same
// order. What changed in this version is the writing: the farm plans and the
// dashboard now read like someone who farms airdrops wrote them for one
// protocol at a time, instead of a form letter with the names swapped. The
// numbers did not move, and the dashboard now says on each row when its own
// multiple is standing on very little evidence.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The gate's caps, restated so this program refuses a bad hand-in before the scorer has to. */
const TEXT_MAX_BYTES = 65_536;
const DOSSIER_CAPS = {
  text_max_bytes: TEXT_MAX_BYTES,
  screenshots: { max: 4, max_bytes: 524_288 },
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
};
const PLAIN_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> (or --name=<value>) out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
}

function fail(message: string): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(1);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) fail(`the model wrote a board the gate refuses: ${issue}`);

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy a directory's regular files into `to`, skipping dot names; returns what it copied. */
function copyPlainFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from).sort()) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

const pageFiles = copyPlainFiles(join(here, 'dashboard'), join(out, 'dashboard'));
if (!pageFiles.includes('index.html')) fail('dashboard/ holds no index.html');
const shots = copyPlainFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3 || shots.length > 4) fail(`screenshots/ holds ${shots.length} images: hand in 3 or 4, the board, a detail view and a filtered view`);
for (const name of shots) {
  if (!PLAIN_NAME.test(name)) fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`);
}

// The dossier goes last: the scorer rebuilds it from this same /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, DOSSIER_CAPS));

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols read, ${snapshot.watchlist.length} on the watchlist, ${board.length} pre-token rows ranked (${radar.early_size} beyond the watchlist), ${radar.live_size} live-token comparisons set aside\n` +
    `token radar: anchors from ${radar.global_comps} traded tokens, global multiple ${radar.global_multiple}x TVL; wrote board.json, data.js, dashboard/ (${pageFiles.length} files), screenshots/ (${shots.length} images) and dossier.json to ${out}\n`,
);
