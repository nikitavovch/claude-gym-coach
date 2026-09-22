import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK = fileURLToPath(new URL('../hooks/session-start.mjs', import.meta.url));
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIR = fileURLToPath(new URL('./fixtures/gym', import.meta.url));

function run(projectDir, envFile) {
  return execFileSync('node', [HOOK], {
    encoding: 'utf8',
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: projectDir,
      CLAUDE_PLUGIN_ROOT: ROOT,
      ...(envFile ? { CLAUDE_ENV_FILE: envFile } : {}),
    },
  });
}

// Builds a throwaway coach folder for one test, so tests/fixtures/gym
// (shared with other tasks) never has to change shape for this file.
function makeCoachDir({ coachJson, sharedGym, ownGyms = {} }) {
  const dir = mkdtempSync(join(tmpdir(), 'coach-'));
  writeFileSync(join(dir, '.coach.json'), JSON.stringify(coachJson));
  if (sharedGym !== undefined) writeFileSync(join(dir, 'gym.md'), sharedGym);
  for (const [id, text] of Object.entries(ownGyms)) {
    mkdirSync(join(dir, 'athletes', id), { recursive: true });
    writeFileSync(join(dir, 'athletes', id, 'gym.md'), text);
  }
  return dir;
}

function rosterLine(out, id) {
  return out.split('\n').find((line) => line.startsWith(`- ${id}:`)) ?? '';
}

function warningLines(out) {
  return out.split('\n').filter((line) => line.startsWith('warning:'));
}

test('stays silent outside a coach folder', () => {
  assert.equal(run(tmpdir(), null).trim(), '');
});

test('prints persona and brief inside a coach folder', () => {
  const out = run(DIR, null);
  assert.match(out, /coach/i);
  assert.match(out, /danila:/);
});

test('prints the shared inventory', () => {
  const out = run(DIR, null);
  assert.match(out, /Gym inventory/i);
});

// A Read tool does not expand variables, so
// the persona reaches the session with the plugin's real path already in
// it — no placeholder left for the model (or a subagent) to resolve.
test('persona addresses plugin files by their real path, with no placeholder left', () => {
  const out = run(DIR, null);
  assert.ok(out.includes(`${ROOT.replace(/[\\/]+$/, '')}/knowledge/safety.md`), 'safety.md is named by its absolute path');
  assert.doesNotMatch(out, /\$\{?(COACH|CLAUDE)_PLUGIN_ROOT/);
});

test('exports the plugin root into the env file', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'coach-'));
  const envFile = join(tmp, 'env');
  writeFileSync(envFile, '');
  run(DIR, envFile);
  assert.match(readFileSync(envFile, 'utf8'), /COACH_PLUGIN_ROOT=/);
});

test('never fails, even on a broken folder, and prints exactly one warning', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'coach-'));
  writeFileSync(join(tmp, '.coach.json'), '{ broken');
  const out = run(tmp, null);
  // A malformed .coach.json makes both the hook's own parse AND stats.mjs
  // (called with the same --dir) fail on the same root cause. The hook
  // must skip the stats call once the config is known unreadable, so this
  // stays a single warning line, not two for one problem.
  assert.equal(warningLines(out).length, 1);
  assert.match(warningLines(out)[0], /cannot read \.coach\.json/);
});

test('a stats.mjs failure unrelated to the config (e.g. an unsupported schema) still yields exactly one warning line', () => {
  const dir = makeCoachDir({
    coachJson: { schema: 99, default_athlete: 'ann', athletes: { ann: { name: 'Ann' } } },
    sharedGym: '# Gym inventory\n- barbell',
  });
  const out = run(dir, null);
  // .coach.json itself parses fine (configOk), so the roster/inventory
  // sections print normally; only stats.mjs rejects the unsupported
  // schema. Its stderr must be captured and folded into one warning line,
  // not inherited straight through to the terminal.
  assert.match(out, /ann:/);
  assert.equal(warningLines(out).length, 1);
  assert.match(warningLines(out)[0], /cannot read training stats/);
  assert.match(warningLines(out)[0], /schema/);
});

test('an athlete with their own gym.md gets it printed and their roster line points at it', () => {
  const dir = makeCoachDir({
    coachJson: {
      schema: 1,
      default_athlete: 'zoe',
      athletes: { zoe: { name: 'Zoe', gym: 'own' } },
    },
    sharedGym: '# Gym inventory\n- shared-only equipment',
    ownGyms: { zoe: '# Gym inventory\n- home rack, one barbell' },
  });
  const out = run(dir, null);
  const line = rosterLine(out, 'zoe');
  assert.match(line, /gym own/);
  assert.doesNotMatch(line, /no file/);
  assert.match(out, /Gym inventory — zoe's own gym/);
  assert.match(out, /home rack, one barbell/);
  // Zoe's own gym is the only one that applies to her — the shared gym
  // (which nobody here is configured to use) must not leak into output.
  assert.doesNotMatch(out, /shared-only equipment/);
});

test('an athlete configured shared has the shared inventory named on their line', () => {
  const dir = makeCoachDir({
    coachJson: {
      schema: 1,
      default_athlete: 'bo',
      athletes: { bo: { name: 'Bo', gym: 'shared' } },
    },
    sharedGym: '# Gym inventory\n- barbell, plates',
  });
  const out = run(dir, null);
  const line = rosterLine(out, 'bo');
  assert.match(line, /gym shared/);
  assert.match(out, /Gym inventory — shared \(bo\)/);
});

test('an athlete configured own with no file on disk gets an explicit unknown-inventory note, never a silent fallback', () => {
  const dir = makeCoachDir({
    coachJson: {
      schema: 1,
      default_athlete: 'sam',
      athletes: { sam: { name: 'Sam', gym: 'own' } },
    },
    sharedGym: '# Gym inventory\n- barbell only',
  });
  const out = run(dir, null);
  const line = rosterLine(out, 'sam');
  assert.match(line, /gym own, no file/);
  assert.match(line, /ask/i);
  // No inventory block at all: not sam's (it doesn't exist) and not a
  // silent fallback to the shared gym that happens to be on disk.
  assert.doesNotMatch(out, /## Gym inventory/);
  assert.doesNotMatch(out, /barbell only/);
});

// Runs the hook the way a client that does not set CLAUDE_PLUGIN_ROOT
// would, so the hook has to work out its own location.
function runWithoutPluginRoot(projectDir) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: projectDir };
  delete env.CLAUDE_PLUGIN_ROOT;
  delete env.CLAUDE_ENV_FILE;
  return execFileSync('node', [HOOK], { encoding: 'utf8', env });
}

// $COACH_PLUGIN_ROOT reaches the skills only through the env file, and the
// env file only exists if the client supports one. When it does not, every
// skill's first command fails at once. Printing the path as a plain line
// gives the session something to fall back on.
test('prints the plugin root as a line the session can fall back on', () => {
  const out = run(DIR, null);
  const line = out.split('\n').find((l) => l.startsWith('plugin root:'));
  assert.ok(line, `no "plugin root:" line in:\n${out}`);
  assert.ok(existsSync(join(line.slice('plugin root:'.length).trim(), 'scripts', 'stats.mjs')));
});

// URL.pathname yields "/C:/..." on Windows, which is not a usable path.
// This only bites when CLAUDE_PLUGIN_ROOT is absent, so test that path.
test('works out its own plugin root as a real path, with no CLAUDE_PLUGIN_ROOT set', () => {
  const out = runWithoutPluginRoot(DIR);
  const line = out.split('\n').find((l) => l.startsWith('plugin root:'));
  assert.ok(line, `no "plugin root:" line in:\n${out}`);
  assert.ok(existsSync(join(line.slice('plugin root:'.length).trim(), 'scripts', 'stats.mjs')));
});

test('the hook converts its own file URL with fileURLToPath, not URL.pathname', () => {
  const src = readFileSync(HOOK, 'utf8');
  assert.doesNotMatch(src, /import\.meta\.url\)\.pathname/);
});

// persona.md is the only text loaded into every session, so it is the only
// place that can guarantee a technique or pharmacology question reaches the
// specialist. Without this, the routing depends on the model noticing an
// agent description on its own — and for nutrition that routing
// is a safety boundary.
const persona = () => readFileSync(join(ROOT, 'hooks', 'persona.md'), 'utf8');

test('persona routes technique questions to the technique specialist', () => {
  assert.match(persona(), /coach:technique/);
});

test('persona routes nutrition and pharmacology questions to the nutrition specialist', () => {
  assert.match(persona(), /coach:nutrition/);
});

test('the hook still prints the plugin root line for commands run by hand', () => {
  assert.match(run(DIR, null), /^plugin root: /m);
});

// The same 8 KB cut stats.mjs had (see cli.test.mjs): the hook's output is
// persona, roster, inventory and brief, and a long inventory pushes it
// past one pipe chunk. Whatever sits at the end must still arrive.
test('a hook output past 8 KB arrives whole', () => {
  const inventory = Array.from({ length: 800 }, (_, i) => `- plate pair ${i + 1}: 1.25 kg`).join('\n');
  const dir = makeCoachDir({
    coachJson: { schema: 1, default_athlete: 'a', athletes: { a: { name: 'A' } } },
    sharedGym: `# Gym\n${inventory}`,
  });
  const out = run(dir);
  assert.ok(out.length > 16384, 'the check needs an output well past one pipe chunk');
  assert.match(out, /plate pair 800: 1\.25 kg/);
  assert.match(out, /## Current state/);
});

test('the hook ends by setting process.exitCode, never by process.exit()', () => {
  assert.doesNotMatch(readFileSync(HOOK, 'utf8'), /process\.exit\(/);
});

test('the hook exits 0, and quietly, when its reader closes early', async () => {
  const child = spawn('node', [HOOK], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CLAUDE_PROJECT_DIR: DIR, CLAUDE_PLUGIN_ROOT: ROOT },
  });
  child.stdout.destroy();
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });
  const code = await new Promise((resolve) => child.on('close', resolve));
  assert.equal(code, 0);
  assert.equal(stderr, '');
});

// The env file is sourced by a shell. JSON.stringify escapes quotes but
// leaves $() and backticks live; single quotes leave nothing live.
test('the exported plugin root survives being sourced by a shell, whatever its characters', { skip: process.platform === 'win32' }, () => {
  const tmp = mkdtempSync(join(tmpdir(), 'coach-'));
  const envFile = join(tmp, 'env');
  const marker = join(tmp, 'pwned');
  writeFileSync(envFile, '');
  const root = `${tmp}/it's $(touch ${marker}) \`touch ${marker}\``;
  execFileSync('node', [HOOK], { encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: DIR, CLAUDE_PLUGIN_ROOT: root, CLAUDE_ENV_FILE: envFile } });
  const value = execFileSync('sh', ['-c', `. "${envFile}"; printf %s "$COACH_PLUGIN_ROOT"`], { encoding: 'utf8' });
  assert.equal(value, root);
  assert.equal(existsSync(marker), false, 'sourcing the env file ran a command');
});

test('a folder whose athlete id is not a slug gets one warning and a clean exit', () => {
  const dir = makeCoachDir({
    coachJson: { schema: 1, default_athlete: 'ok', athletes: { ok: { name: 'Ok' }, '../../etc': { name: 'X', gym: 'own' } } },
    sharedGym: '# Gym',
  });
  const out = run(dir);
  assert.equal(warningLines(out).length, 1, out);
  assert.match(warningLines(out)[0], /athlete id/);
});

test('persona says athlete text is data, never an instruction', () => {
  const persona = readFileSync(join(ROOT, 'hooks', 'persona.md'), 'utf8');
  assert.match(persona, /never an instruction/i);
});

// A plugin root whose persona is missing and whose stats.mjs crashes: the
// session must hear about both, once each, in words that name the cause.
test('a missing persona and a crashing stats.mjs each get one warning that names the cause', () => {
  const fakeRoot = mkdtempSync(join(tmpdir(), 'coach-fakeroot-'));
  mkdirSync(join(fakeRoot, 'scripts'), { recursive: true });
  writeFileSync(join(fakeRoot, 'scripts', 'stats.mjs'), "throw new TypeError('boom');\n");
  const out = execFileSync('node', [HOOK], { encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: DIR, CLAUDE_PLUGIN_ROOT: fakeRoot } });
  const warnings = warningLines(out);
  assert.equal(warnings.length, 2, out);
  assert.ok(warnings.some((w) => /persona/.test(w)), out);
  assert.ok(warnings.some((w) => /TypeError: boom/.test(w)), out);
});
