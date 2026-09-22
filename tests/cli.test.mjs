import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../scripts/stats.mjs', import.meta.url));
const DIR = fileURLToPath(new URL('./fixtures/gym', import.meta.url));

// `phase set` writes to disk, so it needs its own throwaway coach folder —
// DIR above is shared read-only fixture data across every test file here.
function scratchCoachDir() {
  const dir = mkdtempSync(join(tmpdir(), 'coach-cli-phase-'));
  writeFileSync(join(dir, '.coach.json'), JSON.stringify({
    schema: 1,
    default_athlete: 'danila',
    athletes: { danila: { name: 'Danila' } },
  }));
  return dir;
}

function run(args, expectFail = false) {
  try {
    const out = execFileSync('node', [CLI, ...args], { encoding: 'utf8' });
    if (expectFail) throw new Error(`expected command to fail but it exited 0 with:\n${out}`);
    return out;
  } catch (e) {
    if (expectFail) {
      if (typeof e.status !== 'number' || e.status === 0) {
        throw new Error(`expected a non-zero exit code, got ${e.status}: ${e.stdout}${e.stderr}`);
      }
      return e.stdout + e.stderr;
    }
    throw e;
  }
}

test('brief prints a line per athlete', () => {
  const out = run(['brief', '--dir', DIR]);
  assert.match(out, /danila:/);
  assert.match(out, /vera:/);
});

test('recent honours --athlete and --n', () => {
  const out = run(['recent', '--athlete', 'vera', '--n', '1', '--dir', DIR]);
  assert.match(out, /2026-01-06/);
  assert.ok(!out.includes('2026-01-19'));
});

test('exercises accepts several names', () => {
  const out = run(['exercises', 'Жим лёжа', 'Подтягивания', '--dir', DIR]);
  assert.match(out, /Жим лёжа/);
  assert.match(out, /Подтягивания/);
});

test('--json emits parseable JSON', () => {
  const out = run(['brief', '--dir', DIR, '--json']);
  assert.equal(JSON.parse(out).athletes.length, 2);
});

test('validate exits non-zero on a broken file', () => {
  const out = run(['validate', `${DIR}/athletes/danila/log/2026-01-20.md`, '--dir', DIR], true);
  assert.match(out, /FAIL/);
});

test('a folder without .coach.json fails with a readable message', () => {
  const out = run(['brief', '--dir', '/tmp'], true);
  assert.match(out, /coach:init/);
  assert.ok(!/at Object/.test(out), 'must not print a stack trace');
});

test('an unknown command is rejected', () => {
  const out = run(['frobnicate', '--dir', DIR], true);
  assert.match(out, /unknown command/i);
});

test('validate exits 0 on a clean file', () => {
  const out = run(['validate', `${DIR}/athletes/danila/log/2026-01-05.md`, '--dir', DIR]);
  assert.match(out, /OK/);
});

test('an unknown command exits with code 2, not 1', () => {
  try {
    execFileSync('node', [CLI, 'frobnicate', '--dir', DIR], { encoding: 'utf8' });
    assert.fail('expected a non-zero exit');
  } catch (e) {
    assert.equal(e.status, 2);
  }
});

test('a validation failure exits with code 1, not 2', () => {
  try {
    execFileSync(
      'node',
      [CLI, 'validate', `${DIR}/athletes/danila/log/2026-01-20.md`, '--dir', DIR],
      { encoding: 'utf8' }
    );
    assert.fail('expected a non-zero exit');
  } catch (e) {
    assert.equal(e.status, 1);
  }
});

test('a CoachError exits with code 1', () => {
  try {
    execFileSync('node', [CLI, 'brief', '--dir', '/tmp'], { encoding: 'utf8' });
    assert.fail('expected a non-zero exit');
  } catch (e) {
    assert.equal(e.status, 1);
  }
});

test('phase set opens a phase in a fresh coach folder and reports it', () => {
  const dir = scratchCoachDir();
  const out = run(['phase', 'set', 'cut', '--from', '2026-01-05', '--rate', '-0.5%/wk', '--dir', dir]);
  assert.match(out, /opened cut/);
  assert.match(out, /-0\.5%\/wk/);
});

test('phase set with no phase name fails with a readable error', () => {
  const dir = scratchCoachDir();
  const out = run(['phase', 'set', '--dir', dir], true);
  assert.match(out, /phase set needs a phase name/i);
});

test('phase set on the phase already open is a no-op', () => {
  const dir = scratchCoachDir();
  run(['phase', 'set', 'cut', '--from', '2026-01-05', '--dir', dir]);
  const out = run(['phase', 'set', 'cut', '--from', '2026-01-05', '--dir', dir]);
  assert.match(out, /already on cut/);
});

test('phase reports the current open phase', () => {
  const out = run(['phase', '--athlete', 'danila', '--dir', DIR]);
  assert.match(out, /cut/);
});

test('phase --at reports the phase covering that date', () => {
  const out = run(['phase', '--athlete', 'danila', '--at', '2025-12-15', '--dir', DIR]);
  assert.match(out, /bulk/);
});

test('phase for an athlete without a phases.md reports maintain with an unknown start', () => {
  const out = run(['phase', '--athlete', 'vera', '--dir', DIR]);
  assert.match(out, /maintain/);
});

test('validate wires in the exercise database inside a coach folder', () => {
  const out = run(['validate', `${DIR}/validate-cases/2026-01-08.md`, '--dir', DIR]);
  assert.match(out, /unknown exercise/i);
});

test('validate keeps working for a stray file outside any coach folder', () => {
  const out = run(['validate', `${DIR}/athletes/danila/log/2026-01-05.md`, '--dir', '/tmp']);
  assert.match(out, /OK/);
});

test('--help prints usage and exits 0', () => {
  const out = run(['--help']);
  assert.match(out, /Usage:/);
});

test('-h prints usage and exits 0', () => {
  const out = run(['-h']);
  assert.match(out, /Usage:/);
});

test('brief --help prints usage and exits 0 without producing a brief', () => {
  const out = run(['brief', '--help', '--dir', DIR]);
  assert.match(out, /Usage:/);
  assert.ok(!out.includes('danila:'), 'should not contain brief output');
});

test('an unknown flag such as --wat still exits 1', () => {
  const out = run(['--wat', '--dir', DIR], true);
  assert.match(out, /unknown flag/);
});

// Every skill needs today's date on every run. They used to get it from
// `date +%F`, which does not exist on Windows; this command replaces it.
// It must work before a coach folder exists, because `init` asks for the
// date while it is still creating one.
test('today prints the local date as YYYY-MM-DD', () => {
  const out = run(['today']).trim();
  assert.match(out, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(out, new Date().toLocaleDateString('en-CA'));
});

test('today works outside a coach folder, with no .coach.json in sight', () => {
  const out = run(['today', '--dir', mkdtempSync(join(tmpdir(), 'coach-no-config-'))]).trim();
  assert.match(out, /^\d{4}-\d{2}-\d{2}$/);
});

test('help lists today', () => {
  assert.match(run(['help']), /today/);
});

// Windows has no `date +%F`, and the CI matrix runs there — but a source
// check fails in one second instead of one job, and names the reason.
test('stats.mjs derives the date in-process, never by shelling out to date', () => {
  const src = readFileSync(CLI, 'utf8');
  assert.doesNotMatch(src, /execFileSync\(\s*'date'/);
});

const BW_DIR = fileURLToPath(new URL('./fixtures/gym-bw', import.meta.url));

test('bodyweight prints the trend against the phase target', () => {
  const out = run(['bodyweight', '--dir', BW_DIR, '--since', '12w', '--athlete', 'danila']);
  assert.match(out, /entries/);
  assert.match(out, /Trend:/);
  assert.match(out, /Phase: cut/);
});

test('bodyweight --json carries the trend, verdict and flags', () => {
  const r = JSON.parse(run(['bodyweight', '--dir', BW_DIR, '--since', '12w', '--athlete', 'vera', '--json']));
  assert.equal(r.trend.enough, true);
  assert.equal(r.verdict, 'faster than target');
  assert.equal(r.flags.length, 1);
});

test('help lists bodyweight', () => {
  assert.match(run(['help']), /bodyweight/);
});

test('catalog prints the projected table and works with no coach folder', () => {
  const out = run(['catalog', '--dir', mkdtempSync(join(tmpdir(), 'coach-no-config-'))]);
  assert.match(out, /of \d+ exercises/);
  assert.match(out, /^\| Exercise \|/m);
  assert.doesNotMatch(out, /Aliases/);
});

test('catalog narrows by equipment and to main lifts', () => {
  const all = run(['catalog']);
  const home = run(['catalog', '--equipment', 'dumbbell,bodyweight,bench']);
  assert.ok(home.length < all.length, 'filtered catalogue should be smaller');
  // As a row of its own — it may still be named as a substitute elsewhere,
  // which is a separate question the library tests cover.
  assert.doesNotMatch(home, /^\| Back Squat \|/m);

  const mains = run(['catalog', '--main', '--json']);
  const parsed = JSON.parse(mains);
  assert.ok(parsed.exercises.every((e) => e.main));
});

test('catalog names exercises in the requested language', () => {
  assert.match(run(['catalog', '--lang', 'ru', '--main']), /Присед со штангой/);
});

test('help lists catalog', () => {
  assert.match(run(['help']), /catalog/);
});

// Nine commands outgrew a one-line usage string: the
// top-level help is a list, and each command explains its own flags.
test('help lists every command on its own short line', () => {
  const out = run(['help']);
  for (const cmd of ['today', 'brief', 'recent', 'exercises', 'report', 'bodyweight', 'catalog', 'phase', 'phase set', 'validate']) {
    assert.match(out, new RegExp(`^  ${cmd}\\b`, 'm'), `${cmd} missing`);
  }
  for (const line of out.split('\n')) assert.ok(line.length <= 100, `too long: ${line}`);
});

test('a command\'s --help names only the flags it takes', () => {
  const r = run(['report', '--help']);
  assert.match(r, /--since/);
  assert.doesNotMatch(r, /--equipment/);
  const c = run(['catalog', '--help']);
  assert.match(c, /--equipment/);
  assert.match(c, /--main/);
  assert.doesNotMatch(c, /--since/);
});

test('help <command> is the same as <command> --help', () => {
  assert.equal(run(['help', 'report']), run(['report', '--help']));
});

// Found by the first CI run: on Node 20 under macOS a pipe is written
// asynchronously, and process.exit() right after process.stdout.write()
// dropped everything past the first 8 KB — the skills read this CLI
// through a pipe, so a program specialist got a silently cut catalogue.
test('a large --json output arrives whole through a pipe', () => {
  const parsed = JSON.parse(run(['catalog', '--json']));
  assert.ok(JSON.stringify(parsed).length > 16384, 'the check needs an output well past one pipe chunk');
  assert.equal(parsed.exercises.length, parsed.total);
});

test('stats.mjs ends by setting process.exitCode, never by process.exit()', () => {
  assert.doesNotMatch(readFileSync(CLI, 'utf8'), /process\.exit\(/);
});

// `stats.mjs catalog | head` is a natural thing to run. A reader that goes
// away early is not an error the athlete can act on.
test('stats.mjs exits 0, and quietly, when its reader closes early', async () => {
  const child = spawn('node', [CLI, 'catalog', '--json'], { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.destroy();
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });
  const code = await new Promise((resolve) => child.on('close', resolve));
  assert.equal(code, 0);
  assert.equal(stderr, '');
});

test('export prints CSV by default and JSON with --json', () => {
  const REPORT = fileURLToPath(new URL('./fixtures/gym-report', import.meta.url));
  const csv = run(['export', 'sets', '--dir', REPORT]);
  assert.match(csv, /^date,session,exercise,set,load,/);
  const rows = JSON.parse(run(['export', 'cardio', '--dir', REPORT, '--json']));
  assert.ok(Array.isArray(rows) && rows.length > 0);
});

test('export without a table says which ones exist and exits 1', () => {
  assert.match(run(['export', '--dir', DIR], true), /sets, sessions or cardio/);
});

test('report still defaults to four weeks when --since is left out', () => {
  const r = JSON.parse(run(['report', '--dir', DIR, '--json']));
  const d = new Date();
  d.setDate(d.getDate() - 28);
  assert.equal(r.since, d.toLocaleDateString('en-CA'));
});

test('exercise add and alias round-trip through the CLI, and a taken name exits 1', () => {
  const d = mkdtempSync(join(tmpdir(), 'coach-cli-exercise-'));
  copyFileSync(join(DIR, '.coach.json'), join(d, '.coach.json'));
  copyFileSync(join(DIR, 'exercises.md'), join(d, 'exercises.md'));
  assert.match(run(['exercise', 'add', 'Тяга с плинтов', '--aliases', 'тяга с блоков', '--equipment', 'barbell', '--muscles', 'back-lats', '--dir', d]), /added Тяга с плинтов/);
  assert.match(run(['exercise', 'alias', 'Тяга с плинтов', '--aliases', 'плинты', '--dir', d]), /now also answers to плинты/);
  assert.match(run(['exercise', 'add', 'Присед', '--equipment', 'barbell', '--muscles', 'quads', '--dir', d], true), /already names/);
  const known = JSON.parse(run(['exercises', 'плинты', '--dir', d, '--json']));
  assert.equal(known.items[0].canonical, 'Тяга с плинтов');
});

// New athlete text reaches exercise add/alias as JSON on stdin — in the
// skills, through a quoted heredoc the shell never expands — rather than
// as an argument the model has to quote correctly.
function runStdin(args, input, expectFail = false) {
  try {
    const out = execFileSync('node', [CLI, ...args], { encoding: 'utf8', input });
    if (expectFail) throw new Error(`expected failure, got:\n${out}`);
    return out;
  } catch (e) {
    if (!expectFail) throw e;
    return `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
}

test('exercise add and alias read their text as JSON from stdin', () => {
  const d = mkdtempSync(join(tmpdir(), 'coach-cli-stdin-'));
  copyFileSync(join(DIR, '.coach.json'), join(d, '.coach.json'));
  copyFileSync(join(DIR, 'exercises.md'), join(d, 'exercises.md'));
  const add = JSON.stringify({ name: "Farmer's March", aliases: ['марш фермера'], equipment: ['barbell'], muscles: ['back-lats'], main: false });
  assert.match(runStdin(['exercise', 'add', '--stdin', '--dir', d], add), /added Farmer's March/);
  assert.match(runStdin(['exercise', 'alias', '--stdin', '--dir', d], JSON.stringify({ name: 'марш фермера', aliases: ['фермер'] })), /now also answers to фермер/);
  assert.match(runStdin(['exercise', 'add', '--stdin', '--dir', d], 'not json', true), /--stdin expects JSON/);
  assert.match(runStdin(['exercise', 'add', '--stdin', '--dir', d], JSON.stringify({ name: 'Жим $(id)', equipment: ['barbell'], muscles: ['chest'] }), true), /shell/);
});

// An athlete id becomes a path segment everywhere; the pattern init asks
// for is enforced in code, not only in prose.
test('an athlete id outside the slug pattern is refused before any path is built', () => {
  const d = mkdtempSync(join(tmpdir(), 'coach-cli-badid-'));
  writeFileSync(join(d, '.coach.json'), JSON.stringify({ schema: 1, default_athlete: '../escape', athletes: { '../escape': { name: 'X' } } }));
  assert.match(run(['brief', '--dir', d], true), /athlete id "\.\.\/escape"/);
});

test('exercises and phase set also take the athlete text as JSON on stdin', () => {
  const known = JSON.parse(runStdin(['exercises', '--stdin', '--dir', DIR, '--json'], JSON.stringify({ names: ['жим штанги лёжа'] })));
  assert.equal(known.items[0].canonical, 'Жим лёжа');
  const dir = scratchCoachDir();
  const out = JSON.parse(runStdin(['phase', 'set', 'cut', '--stdin', '--dir', dir, '--json'], JSON.stringify({ rate: '-0.5%/wk' })));
  assert.equal(out.targetRate, '-0.5%/wk');
});

test('a flag given without its value is a readable error, not a stack trace', () => {
  for (const args of [['brief', '--dir'], ['catalog', '--equipment'], ['report', '--dir', DIR, '--since']]) {
    const out = run(args, true);
    assert.match(out, /needs a value/, args.join(' '));
    assert.doesNotMatch(out, /\n\s+at /, `${args.join(' ')} printed a stack trace`);
  }
});

test('--stdin with JSON that is not an object is a readable error', () => {
  assert.match(runStdin(['exercises', '--stdin', '--dir', DIR], 'null', true), /--stdin expects JSON/);
});

// On Windows argv[1] is a native path and import.meta.url a file URL, so a
// `file://${argv[1]}` guard never matches there and the script did nothing.
test('the table builder decides it was run directly the same way on every OS', () => {
  const src = readFileSync(fileURLToPath(new URL('../scripts/dev/build-exercise-tables.mjs', import.meta.url)), 'utf8');
  assert.doesNotMatch(src, /`file:\/\/\$\{process\.argv\[1\]\}`/);
  assert.match(src, /pathToFileURL\(process\.argv\[1\]\)/);
});

// Found before 1.0, in a hunt for silent failures.
test('catalog refuses an equipment tag it does not know and lists the real ones', () => {
  const out = run(['catalog', '--equipment', 'dumbbells,machines'], true);
  assert.match(out, /unknown equipment "dumbbells"/);
  assert.match(out, /dumbbell/);
});

test('validate with no files is an error, not a silent OK', () => {
  assert.match(run(['validate', '--dir', DIR], true), /at least one file/);
});

test('a default athlete that is not in the roster is refused', () => {
  const d = mkdtempSync(join(tmpdir(), 'coach-cli-default-'));
  writeFileSync(join(d, '.coach.json'), JSON.stringify({ schema: 1, default_athlete: 'danil', athletes: { danila: { name: 'Danila' } } }));
  assert.match(run(['recent', '--dir', d], true), /default_athlete "danil"/);
});

test('validate inside a folder whose .coach.json is broken says so', () => {
  const d = mkdtempSync(join(tmpdir(), 'coach-cli-brokenjson-'));
  writeFileSync(join(d, '.coach.json'), '{ not json');
  const file = join(d, '2026-01-05.md');
  writeFileSync(file, '---\ndate: 2026-01-05\nsession: A\nstatus: done\n---\n\n## Факт\n- Жим лёжа: 100x5\n');
  assert.match(run(['validate', file, '--dir', d], true), /not valid JSON/);
});

// One clock for the whole plugin: review names its file by ISO week, and
// `date +%G-W%V` does not exist on Windows any more than `date +%F` does.
test('week prints the ISO week of today', () => {
  const out = run(['week']).trim();
  assert.match(out, /^\d{4}-W\d{2}$/);
});

test('load and warmup read the athlete gym and say what to put on the bar', () => {
  const d = mkdtempSync(join(tmpdir(), 'coach-cli-gym-'));
  writeFileSync(join(d, '.coach.json'), JSON.stringify({ schema: 1, units: 'kg', default_athlete: 'a', athletes: { a: { name: 'A', gym: 'shared' } } }));
  writeFileSync(join(d, 'gym.md'), '# Gym\n\n## Plates\n- bar: 20\n- plates: 25, 20, 15, 10, 5, 2.5, 1.25\n');
  assert.match(run(['load', '103', '--dir', d]), /102\.5 kg — per side: 25 \+ 15 \+ 1\.25/);
  assert.match(run(['warmup', '105', '--dir', d]), /20 kg × 8–10/);
  const noLines = mkdtempSync(join(tmpdir(), 'coach-cli-gym-prose-'));
  writeFileSync(join(noLines, '.coach.json'), JSON.stringify({ schema: 1, default_athlete: 'a', athletes: { a: { name: 'A' } } }));
  writeFileSync(join(noLines, 'gym.md'), '# Gym\nA bar and some plates.\n');
  assert.match(run(['load', '100', '--dir', noLines], true), /no "- bar:"/);
});
