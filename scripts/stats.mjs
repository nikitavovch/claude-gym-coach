#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { isoWeek } from './lib/calc.mjs';
import { loadConfig, loadDb, resolveAthlete, CoachError } from './lib/data.mjs';
import { brief, recent, exercises, report, validate, phase, phaseSet, bodyweight, catalog, exportRows, exerciseAdd, exerciseAlias, loadFor, warmupFor } from './lib/commands.mjs';
import { formatBrief, formatRecent, formatExercises, formatReport, formatValidate, formatPhase, formatPhaseSet, formatBodyweight, formatCatalog, formatCsv, formatExerciseChange, formatLoad, formatWarmup } from './lib/format.mjs';

function parseArgs(argv) {
  const positional = [];
  const flags = { dir: process.cwd(), json: false, n: null, since: null, athlete: null, at: null, from: null, rate: null, help: false, equipment: null, main: false, lang: 'en', aliases: [], muscles: [], stdin: false, dumbbell: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    // A flag that takes a value, given last or followed by another flag, is
    // the user's typo, not a crash with a stack trace.
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new CoachError(`${arg} needs a value`);
      return v;
    };
    const list = () => value().split(',').map((e) => e.trim()).filter(Boolean);
    if (arg === '--json') flags.json = true;
    else if (arg === '--dir') flags.dir = value();
    else if (arg === '--athlete') flags.athlete = value();
    else if (arg === '--n') flags.n = Number(value());
    else if (arg === '--since') flags.since = value();
    else if (arg === '--at') flags.at = value();
    else if (arg === '--from') flags.from = value();
    else if (arg === '--rate') flags.rate = value();
    else if (arg === '--equipment') flags.equipment = list();
    else if (arg === '--aliases') flags.aliases = list();
    else if (arg === '--muscles') flags.muscles = list();
    else if (arg === '--main') flags.main = true;
    else if (arg === '--stdin') flags.stdin = true;
    else if (arg === '--dumbbell') flags.dumbbell = true;
    else if (arg === '--lang') flags.lang = value();
    else if (arg === '--help' || arg === '-h') flags.help = true;
    else if (arg.startsWith('--')) throw new CoachError(`unknown flag ${arg}`);
    else positional.push(arg);
  }

  return { command: positional[0], rest: positional.slice(1), flags };
}

// Today in the machine's own timezone. Derived in-process rather than from
// `date +%F`, which does not exist on Windows — and since the skills now
// call `stats.mjs today` for every date they write, this one function is
// where the whole plugin's notion of "today" lives.
function today() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Loads the exercise database for `validate` when --dir points at a coach
// folder, so unknown-exercise / missing-RPE warnings kick in. Outside a
// coach folder (e.g. validating a stray file), validation must still work
// on parse errors alone, so a missing .coach.json is not an error here.
function loadDbForValidate(dir) {
  // Only a folder with no .coach.json at all is "outside a coach folder";
  // a broken one is an error to report, not a reason to skip the checks.
  if (!existsSync(join(dir, '.coach.json'))) return null;
  loadConfig(dir);
  return loadDb(dir);
}

// One entry per command: what it does, and only the flags it reads. Every
// command but `today` also takes --json; all that read a coach folder take
// --dir, and all that read one athlete take --athlete.
const USAGE = {
  today: ['', 'Print the local date as YYYY-MM-DD', []],
  week: ['', 'Print the ISO week of today as YYYY-Www', []],
  brief: ['', 'Last session, today and open plans for every athlete', ['--dir path']],
  recent: ['', 'The newest log files, newest first', ['--athlete id', '--dir path', '--n N (default 5)']],
  exercises: ['<name...>', 'History, records and e1RM per exercise', ['--athlete id', '--dir path', '--n N (default 3)', '--stdin (JSON: names)']],
  report: ['', 'Records, trends, volume, misses, cardio, fatigue', ['--athlete id', '--dir path', '--since 4w|2m|YYYY-MM-DD']],
  bodyweight: ['', 'Bodyweight trend against the phase target', ['--athlete id', '--dir path', '--since 4w|2m|YYYY-MM-DD']],
  catalog: ['', 'The exercise database, filtered for a program', ['--equipment a,b,c', '--main', '--lang en|ru']],
  phase: ['', 'The current nutrition phase', ['--athlete id', '--dir path', '--at YYYY-MM-DD']],
  'phase set': ['<cut|bulk|maintain>', 'Close the open phase and start a new one', ['--athlete id', '--dir path', '--from YYYY-MM-DD', '--rate text', '--stdin (JSON: rate)']],
  validate: ['<file...>', 'Check log files parse; warnings inside a coach folder', ['--dir path']],
  'exercise add': ['<name>', 'Add your own exercise to the folder\'s exercises.md', ['--aliases a,b', '--equipment a,b', '--muscles primary,secondary', '--main', '--stdin (JSON: name, aliases, equipment, muscles, main)', '--dir path']],
  'exercise alias': ['<name>', 'Teach an existing exercise another name', ['--aliases a,b', '--stdin (JSON: name, aliases)', '--dir path']],
  load: ['<target>', 'The nearest load the gym can build, with plates per side', ['--dumbbell', '--athlete id', '--dir path']],
  warmup: ['<working weight>', 'A warm-up ramp to a working weight, each step buildable', ['--athlete id', '--dir path']],
  export: ['<sets|sessions|cardio>', 'Your data as CSV for a spreadsheet (or --json)', ['--athlete id', '--dir path', '--since 4w|2m|YYYY-MM-DD (default: everything)']],
};

function commandHelp(name) {
  const [args, what, opts] = USAGE[name];
  const json = ['today', 'week'].includes(name) ? [] : ['--json'];
  return [`Usage: stats.mjs ${name}${args ? ` ${args}` : ''}`, `  ${what}`, ...[...opts, ...json].map((o) => `  ${o}`)].join('\n');
}

function overallHelp() {
  const width = Math.max(...Object.keys(USAGE).map((k) => k.length));
  const rows = Object.entries(USAGE).map(([k, [, what]]) => `  ${k.padEnd(width)}  ${what}`);
  return ['Usage: stats.mjs <command> [--help]', '', ...rows].join('\n');
}

function readJsonStdin() {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    parsed = null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new CoachError('--stdin expects JSON, e.g. {"name": "...", "aliases": ["..."]}');
  }
  return parsed;
}

// `phase set --help` and `help phase set` both mean the two-word command.
function helpTarget(words) {
  const pair = words.slice(0, 2).join(' ');
  return USAGE[pair] ? pair : words[0];
}

function main() {
  const { command, rest, flags } = parseArgs(process.argv.slice(2));

  if (!command || command === 'help' || flags.help) {
    const target = helpTarget(command === 'help' ? rest : [command, ...rest]);
    process.stdout.write(`${USAGE[target] ? commandHelp(target) : overallHelp()}\n`);
    return 0;
  }

  // Before loadConfig on purpose: `init` needs the date while it is still
  // creating the folder that would hold a config.
  if (command === 'today') {
    process.stdout.write(today() + '\n');
    return 0;
  }

  // The ISO week review names its file by, from the same clock.
  if (command === 'week') {
    process.stdout.write(isoWeek(today()) + '\n');
    return 0;
  }

  // Before loadConfig, like `today`: the catalogue is the plugin's own
  // knowledge and has nothing to do with a particular athlete's folder.
  if (command === 'catalog') {
    const result = catalog({ equipment: flags.equipment, main: flags.main, lang: flags.lang });
    process.stdout.write((flags.json ? JSON.stringify(result, null, 2) : formatCatalog(result)) + '\n');
    return 0;
  }

  if (command === 'validate') {
    if (!rest.length) throw new CoachError('validate needs at least one file');
    const db = loadDbForValidate(flags.dir);
    const result = validate(rest, db);
    process.stdout.write((flags.json ? JSON.stringify(result, null, 2) : formatValidate(result)) + '\n');
    return result.files.every((f) => f.ok) ? 0 : 1;
  }

  const config = loadConfig(flags.dir);
  const now = today();

  if (command === 'brief') {
    const result = brief(flags.dir, config, now);
    process.stdout.write((flags.json ? JSON.stringify(result, null, 2) : formatBrief(result)) + '\n');
    return 0;
  }

  // The folder's exercise table is shared by every athlete in it.
  if (command === 'exercise') {
    const [action, ...words] = rest;
    // --stdin: the athlete's new text arrives as JSON, which the skills send
    // through a quoted heredoc the shell never expands.
    const spec = flags.stdin
      ? readJsonStdin()
      : { name: words.join(' '), aliases: flags.aliases, equipment: flags.equipment ?? [], muscles: flags.muscles, main: flags.main };
    let result;
    if (action === 'add') {
      result = exerciseAdd(flags.dir, config, spec);
    } else if (action === 'alias') {
      result = exerciseAlias(flags.dir, config, spec.name, spec.aliases);
    } else {
      throw new CoachError('exercise needs add or alias — see stats.mjs exercise add --help');
    }
    process.stdout.write((flags.json ? JSON.stringify(result, null, 2) : formatExerciseChange(result)) + '\n');
    return 0;
  }

  const id = resolveAthlete(config, flags.athlete);

  if (command === 'recent') {
    const result = recent(flags.dir, config, id, flags.n ?? 5);
    process.stdout.write((flags.json ? JSON.stringify(result, null, 2) : formatRecent(result)) + '\n');
    return 0;
  }

  if (command === 'exercises') {
    const names = flags.stdin ? readJsonStdin().names ?? [] : rest;
    if (!names.length) throw new CoachError('exercises needs at least one exercise name');
    const result = exercises(flags.dir, config, id, names, flags.n ?? 3, now);
    process.stdout.write((flags.json ? JSON.stringify(result, null, 2) : formatExercises(result)) + '\n');
    return 0;
  }

  if (command === 'report') {
    const result = report(flags.dir, config, id, flags.since ?? '4w', now);
    process.stdout.write((flags.json ? JSON.stringify(result, null, 2) : formatReport(result)) + '\n');
    return 0;
  }

  if (command === 'bodyweight') {
    const result = bodyweight(flags.dir, config, id, flags.since ?? '4w', now);
    process.stdout.write((flags.json ? JSON.stringify(result, null, 2) : formatBodyweight(result)) + '\n');
    return 0;
  }

  if (command === 'load') {
    const result = loadFor(flags.dir, config, id, rest[0], { dumbbell: flags.dumbbell });
    process.stdout.write((flags.json ? JSON.stringify(result, null, 2) : formatLoad(result)) + '\n');
    return 0;
  }

  if (command === 'warmup') {
    const result = warmupFor(flags.dir, config, id, rest[0]);
    process.stdout.write((flags.json ? JSON.stringify(result, null, 2) : formatWarmup(result)) + '\n');
    return 0;
  }

  // Warnings go to stderr: stdout is a table a spreadsheet opens as is.
  if (command === 'export') {
    const result = exportRows(flags.dir, config, id, rest[0], flags.since, now);
    for (const w of result.warnings) process.stderr.write(`warning: ${w}\n`);
    process.stdout.write(flags.json ? `${JSON.stringify(result.rows, null, 2)}\n` : formatCsv(result));
    return 0;
  }

  if (command === 'phase') {
    if (rest[0] === 'set') {
      const phaseName = rest[1];
      if (!phaseName) throw new CoachError('phase set needs a phase name: cut, bulk or maintain');
      const rate = flags.stdin ? readJsonStdin().rate ?? null : flags.rate;
      const result = phaseSet(flags.dir, config, id, phaseName, now, { from: flags.from, rate });
      process.stdout.write((flags.json ? JSON.stringify(result, null, 2) : formatPhaseSet(result)) + '\n');
      return 0;
    }
    const result = phase(flags.dir, config, id, now, flags.at);
    process.stdout.write((flags.json ? JSON.stringify(result, null, 2) : formatPhase(result)) + '\n');
    return 0;
  }

  process.stderr.write(`unknown command "${command}"\n`);
  return 2;
}

// A reader that closed early (`stats.mjs catalog | head`) wants no more
// output; that is not a failure worth a stack trace.
process.stdout.on('error', (e) => {
  if (e.code !== 'EPIPE') throw e;
});

// process.exitCode, never an explicit process.exit: a POSIX pipe is written
// asynchronously, and exiting at once dropped everything past the first
// 8 KB on Node 20 under macOS — the first CI run caught it there.
try {
  process.exitCode = main();
} catch (e) {
  if (!(e instanceof CoachError)) throw e;
  process.stderr.write(`${e.message}\n`);
  process.exitCode = 1;
}
