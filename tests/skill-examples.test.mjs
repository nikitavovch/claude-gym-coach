// Every worked example a skill shows the model is, in effect, training data
// for how to write a log file. An example that doesn't actually parse, or
// that writes an exercise name the reference table doesn't recognize as
// canonical, silently teaches the wrong thing — two such examples once
// slipped into skills/log/SKILL.md unnoticed. These tests run every worked
// example through the real parser and the real exercise tables, the same
// way a human reviewer had to by hand.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLogFile } from '../scripts/lib/parse-log.mjs';
import { parseExerciseTable, resolveExercise } from '../scripts/lib/exercises.mjs';

const SKILLS_DIR = fileURLToPath(new URL('../skills/', import.meta.url));

const ruDb = parseExerciseTable(readFileSync(new URL('../templates/ru/exercises.md', import.meta.url), 'utf8'));
const enDb = parseExerciseTable(readFileSync(new URL('../templates/en/exercises.md', import.meta.url), 'utf8'));

// \r?\n: Git for Windows checks text out with CRLF by default, and the CI
// runner does too. The blocks keep their line endings on the way to the
// parser, so the Windows job also proves a CRLF log file parses.
function fencedBlocks(text) {
  const blocks = [];
  const re = /```\r?\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text)) !== null) blocks.push(m[1]);
  return blocks;
}

function assertParsesCleanAndCanonical(label, day, db) {
  assert.deepEqual(day.errors, [], `${label}: unexpected parse errors: ${day.errors.join('; ')}`);
  assert.ok(day.actual.length > 0, `${label}: expected at least one exercise line`);
  for (const entry of day.actual) {
    const resolved = resolveExercise(entry.name, db);
    assert.ok(resolved, `${label}: "${entry.name}" does not resolve against the reference table`);
    assert.equal(
      resolved.canonical,
      entry.name,
      `${label}: "${entry.name}" is not the table's canonical name (canonical is "${resolved.canonical}") — the file must record the canonical name, not the dictated spelling`,
    );
  }
}

// The examples say what was dictated and what got written; the dictated
// spelling must resolve through the table to the name written, or the
// example teaches a match the parser would never make.
test('every dictated name in the log examples resolves to the name the example writes', () => {
  const pairs = [['Разводка в стороны', ruDb, 'Разведение гантелей в стороны'], ['Squats', enDb, 'Back Squat']];
  for (const [dictated, db, written] of pairs) {
    assert.equal(resolveExercise(dictated, db)?.canonical, written, dictated);
  }
});

test('every worked example in skills/log/SKILL.md parses with zero errors and writes canonical exercise names', () => {
  const text = readFileSync(new URL('../skills/log/SKILL.md', import.meta.url), 'utf8');
  const sectionBlocks = fencedBlocks(text).filter((b) => /^## (Факт|Actual)$/m.test(b));
  assert.ok(sectionBlocks.length >= 4, `expected at least 4 worked examples, found ${sectionBlocks.length}`);

  for (const [i, block] of sectionBlocks.entries()) {
    const isRu = /^## Факт$/m.test(block);
    const md = `---\ndate: 2026-01-01\nsession: Test\nstatus: done\n---\n\n${block}`;
    const day = parseLogFile(md, '2026-01-01.md');
    assertParsesCleanAndCanonical(`skills/log/SKILL.md example ${i + 1}`, day, isRu ? ruDb : enDb);
  }
});

// A cardio-only day is written with no exercise section at all, so the
// examples above never reach it.
test('every cardio-only worked example in skills/log/SKILL.md parses clean as a closed day', () => {
  const text = readFileSync(new URL('../skills/log/SKILL.md', import.meta.url), 'utf8');
  const cardioBlocks = fencedBlocks(text)
    .filter((b) => /^## (Кардио|Cardio)$/m.test(b) && !/^## (Факт|Actual)$/m.test(b));
  assert.ok(cardioBlocks.length >= 1, `expected at least 1 cardio-only example, found ${cardioBlocks.length}`);

  for (const [i, block] of cardioBlocks.entries()) {
    const md = `---\ndate: 2026-01-01\nsession: Кардио\nstatus: done\n---\n\n${block}`;
    const day = parseLogFile(md, '2026-01-01.md');
    assert.deepEqual(day.errors, [], `cardio example ${i + 1}: ${day.errors.join('; ')}`);
    assert.equal(day.actual.length, 0, `cardio example ${i + 1} should carry no exercise lines`);
    assert.ok(day.cardio.length >= 1, `cardio example ${i + 1} has no cardio line the parser reads`);
  }
});

test('every full-file worked example in skills/import/SKILL.md parses with zero errors and writes canonical exercise names', () => {
  const text = readFileSync(new URL('../skills/import/SKILL.md', import.meta.url), 'utf8');
  const fileBlocks = fencedBlocks(text).filter((b) => /^---\r?\ndate:/m.test(b));
  assert.ok(fileBlocks.length >= 2, `expected at least 2 worked file examples, found ${fileBlocks.length}`);

  for (const [i, block] of fileBlocks.entries()) {
    const dateMatch = /^date:\s*(\d{4}-\d{2}-\d{2})/m.exec(block);
    assert.ok(dateMatch, `import example ${i + 1}: no date found in frontmatter`);
    const day = parseLogFile(block, `${dateMatch[1]}.md`);
    assertParsesCleanAndCanonical(`skills/import/SKILL.md example ${i + 1}`, day, ruDb);
  }
});

// A skill that tells the model to run `date +%F` is a skill that fails on
// Windows, where that command does not exist. The date now comes from
// `stats.mjs today`, which is the same clock the reports use.
test('no skill tells the model to shell out to date +%F', () => {
  const offenders = readdirSync(SKILLS_DIR)
    .filter((name) => existsSync(join(SKILLS_DIR, name, 'SKILL.md')))
    .filter((name) => /date \+%F/.test(readFileSync(join(SKILLS_DIR, name, 'SKILL.md'), 'utf8')));
  assert.deepEqual(offenders, []);
});

test('every skill that needs today gets it from stats.mjs today', () => {
  const needsDate = readdirSync(SKILLS_DIR)
    .filter((name) => existsSync(join(SKILLS_DIR, name, 'SKILL.md')))
    .filter((name) => /today's date|today/i.test(readFileSync(join(SKILLS_DIR, name, 'SKILL.md'), 'utf8')));
  for (const name of needsDate) {
    const text = readFileSync(join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');
    assert.match(text, /stats\.mjs" today/, `skills/${name}/SKILL.md never calls stats.mjs today`);
  }
});

// A correct formatter is not enough: the program designers and the planner
// write increments themselves, so the unit has to travel with the task.
// Without it a pound athlete gets "+2.5 kg" in their program.
test('every skill that hands work to an agent passes the athlete units', () => {
  for (const name of ['init', 'plan', 'review']) {
    const text = readFileSync(join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');
    assert.match(text, /units/, `skills/${name}/SKILL.md never mentions units`);
  }
});

// The trend is computed now, so the skills that discuss bodyweight must
// take it from stats rather than eyeballing the logs — the same rule that
// already governs every other number.
test('the skills that discuss bodyweight take the trend from stats', () => {
  for (const name of ['phase', 'review']) {
    const text = readFileSync(join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');
    assert.match(text, /bodyweight/i, `skills/${name}/SKILL.md never mentions bodyweight`);
  }
});

// A profile nobody revisits quietly rots: all four specialists read its
// modifiers as current fact. `review` is the one place that already has
// the athlete's attention for long enough to ask.
test('review acts on a stale profile and init dates the first confirmation', () => {
  assert.match(readFileSync(join(SKILLS_DIR, 'review', 'SKILL.md'), 'utf8'), /profile\.stale/);
  assert.match(readFileSync(join(SKILLS_DIR, 'init', 'SKILL.md'), 'utf8'), /## Checked|## Проверено/);
});

test('both profile templates carry the Checked section', () => {
  const root = new URL('../templates/', import.meta.url);
  assert.match(readFileSync(new URL('en/profile.md', root), 'utf8'), /## Checked/);
  assert.match(readFileSync(new URL('ru/profile.md', root), 'utf8'), /## Проверено/);
});

// Every program specialist used to read all 9958 words of
// knowledge/exercises.md to pick exercises; `catalog` hands them the same
// rows without the alias columns a picker cannot use, filtered to the gym.
test('the program specialists pick from the catalog command, not the whole file', () => {
  const dir = new URL('../agents/', import.meta.url);
  for (const name of ['program-beginner', 'program-strength', 'program-hypertrophy', 'program-powerbuilding', 'planner']) {
    const text = readFileSync(new URL(`${name}.md`, dir), 'utf8');
    assert.match(text, /stats\.mjs" catalog/, `agents/${name}.md never calls stats.mjs catalog`);
  }
});

// A data folder holds health information. init may start its history
// locally, but where that history goes is the athlete's decision alone:
// no skill adds a remote or pushes anywhere.
test('init offers a local git history and checks for an existing one first', () => {
  const text = readFileSync(join(SKILLS_DIR, 'init', 'SKILL.md'), 'utf8');
  assert.match(text, /git init/);
  assert.match(text, /git rev-parse --is-inside-work-tree/);
});

test('no skill pushes the data folder anywhere or adds a remote', () => {
  const offenders = readdirSync(SKILLS_DIR)
    .filter((name) => existsSync(join(SKILLS_DIR, name, 'SKILL.md')))
    .filter((name) => /git push|git remote add/.test(readFileSync(join(SKILLS_DIR, name, 'SKILL.md'), 'utf8')));
  assert.deepEqual(offenders, []);
});

// Every skill that adds to the folder's exercise table goes through the
// CLI, whose collision check is the only thing standing between a new row
// and a stolen name (exercises.mjs).
test('every skill that adds exercises writes them through stats.mjs exercise', () => {
  for (const name of ['exercise', 'log', 'import', 'init']) {
    const text = readFileSync(join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');
    assert.match(text, /stats\.mjs" exercise add/, `skills/${name}/SKILL.md does not add exercises through the CLI`);
  }
  assert.match(readFileSync(join(SKILLS_DIR, 'exercise', 'SKILL.md'), 'utf8'), /stats\.mjs" exercise alias/);
});

// /coach:gym edits an inventory without a second init.
// What makes it more than a text edit is the check afterwards: the program
// is read against the new equipment the same way the planner reads it.
test('gym checks every affected program against the new inventory through catalog', () => {
  const text = readFileSync(join(SKILLS_DIR, 'gym', 'SKILL.md'), 'utf8');
  assert.match(text, /stats\.mjs" catalog/);
  assert.match(text, /program\.md/);
});

test('init no longer claims to be the only skill that writes a gym file', () => {
  const text = readFileSync(join(SKILLS_DIR, 'init', 'SKILL.md'), 'utf8');
  assert.match(text, /\/coach:gym/);
});

// A photo of a notebook page is transcribed and shown
// back before anything is parsed: a digit guessed from handwriting would
// sit in the log as a real weight — and a record — for good.
test('import transcribes a photo verbatim, marks what it cannot read, and waits for the athlete', () => {
  const text = readFileSync(join(SKILLS_DIR, 'import', 'SKILL.md'), 'utf8');
  assert.match(text, /photo/i);
  assert.match(text, /\[\?\]/);
  assert.match(text, /never guess/i);
});

// New athlete text reaches the CLI as JSON inside a quoted heredoc, which a
// shell never expands, rather than as an argument the model must quote.
test('skills that add exercises pass the new text through --stdin in a quoted heredoc', () => {
  for (const name of ['exercise', 'log', 'import', 'init']) {
    const text = readFileSync(join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');
    assert.match(text, /exercise (add|alias) --stdin <<'COACH_JSON'/, `skills/${name}/SKILL.md`);
    assert.doesNotMatch(text, /exercise (add|alias) "</, `skills/${name}/SKILL.md still quotes new text on the command line`);
  }
});

test('free athlete text reaches exercises and phase set through --stdin, and names are quoted', () => {
  assert.match(readFileSync(join(SKILLS_DIR, 'exercise', 'SKILL.md'), 'utf8'), /exercises --stdin --json <<'COACH_JSON'/);
  const phase = readFileSync(join(SKILLS_DIR, 'phase', 'SKILL.md'), 'utf8');
  assert.match(phase, /phase set <phase>[^\n]*--stdin[^\n]*<<'COACH_JSON'/);
  assert.doesNotMatch(phase, /--rate "</);
  for (const name of ['plan', 'log']) {
    assert.doesNotMatch(readFileSync(join(SKILLS_DIR, name, 'SKILL.md'), 'utf8'), /exercises <(exercise|name) 1>/, `skills/${name} leaves multi-word names unquoted`);
  }
});

// ${CLAUDE_PLUGIN_ROOT} is replaced with the install path in a plugin
// skill's text before the model reads it; $COACH_PLUGIN_ROOT only ever
// existed inside Bash, so a Read of a knowledge file could not use it.
test('skills address plugin files through ${CLAUDE_PLUGIN_ROOT}, never $COACH_PLUGIN_ROOT', () => {
  for (const name of readdirSync(SKILLS_DIR).filter((n) => existsSync(join(SKILLS_DIR, n, 'SKILL.md')))) {
    const text = readFileSync(join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');
    assert.doesNotMatch(text, /\$COACH_PLUGIN_ROOT/, `skills/${name}/SKILL.md`);
    if (/stats\.mjs/.test(text)) assert.match(text, /\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/stats\.mjs/, `skills/${name}/SKILL.md`);
  }
});

test('no skill shells out to date at all', () => {
  const offenders = readdirSync(SKILLS_DIR)
    .filter((name) => existsSync(join(SKILLS_DIR, name, 'SKILL.md')))
    .filter((name) => /\bdate \+/.test(readFileSync(join(SKILLS_DIR, name, 'SKILL.md'), 'utf8')));
  assert.deepEqual(offenders, []);
});

// Every rate phase offers the athlete must be one the script can judge; an
// option it cannot parse is a verdict the athlete is promised and never gets.
test('every target rate the phase skill offers parses', async () => {
  const { parseTargetRate } = await import('../scripts/lib/data.mjs');
  const text = readFileSync(join(SKILLS_DIR, 'phase', 'SKILL.md'), 'utf8');
  const offered = [...text.matchAll(/offer `([^`]+)`(?: \([^)]*\))?(?: and `([^`]+)`)?/g)].flatMap((m) => [m[1], m[2]]).filter(Boolean);
  assert.ok(offered.length >= 5, `found ${offered.join(', ')}`);
  for (const rate of offered) assert.ok(parseTargetRate(rate), `phase offers "${rate}", which never parses`);
});

// Before 1.0 the modifiers every specialist carries —
// sex, age over 40 — were never asked for, and nothing screened a new
// athlete's health before the first programme.
test('init screens age and health before any programme, by safety.md', () => {
  const init = readFileSync(join(SKILLS_DIR, 'init', 'SKILL.md'), 'utf8');
  assert.match(init, /Under 18: stop here/);
  assert.match(init, /safety\.md` §8/);
  const safety = readFileSync(new URL('../knowledge/safety.md', import.meta.url), 'utf8');
  for (const heading of ['## 8. Before a first programme', '## 9. Stop now', '## 10. Under 18']) {
    assert.ok(safety.includes(heading), heading);
  }
  for (const lang of ['en', 'ru']) {
    const profile = readFileSync(new URL(`../templates/${lang}/profile.md`, import.meta.url), 'utf8');
    assert.match(profile, /## (Health screen|Скрининг здоровья)/, lang);
  }
});

// Plugin agents get ${CLAUDE_PLUGIN_ROOT} substituted "anywhere in the agent
// content" (plugins reference); an agent without Bash — technique — could
// not open safety.md through $COACH_PLUGIN_ROOT at all.
test('agents address plugin files through ${CLAUDE_PLUGIN_ROOT}, and knowledge files never through a variable', () => {
  const AGENTS = fileURLToPath(new URL('../agents/', import.meta.url));
  for (const name of readdirSync(AGENTS).filter((n) => n.endsWith('.md'))) {
    assert.doesNotMatch(readFileSync(join(AGENTS, name), 'utf8'), /\$COACH_PLUGIN_ROOT/, `agents/${name}`);
  }
  const KNOWLEDGE = fileURLToPath(new URL('../knowledge/', import.meta.url));
  const files = readdirSync(KNOWLEDGE, { recursive: true }).filter((n) => String(n).endsWith('.md'));
  for (const name of files) {
    assert.doesNotMatch(readFileSync(join(KNOWLEDGE, String(name)), 'utf8'), /\$\{?(COACH|CLAUDE)_PLUGIN_ROOT/, `knowledge/${name} is read as a file; nothing substitutes a variable there`);
  }
});

// The commonest dictation is today's plan in the athlete's own shorthand.
// Asking what "подъём на носки" means when the plan names one calf raise
// is friction the plan has already removed — and in a single-pass run the
// question alone once kept a session out of the log. The reply says what the name was written as, so nothing is
// resolved silently.
test('log lets the open plan settle a shorthand name, and says what it wrote', () => {
  const text = readFileSync(join(SKILLS_DIR, 'log', 'SKILL.md'), 'utf8');
  const at = text.indexOf('**A name the plan already settles.**');
  assert.notEqual(at, -1, 'skills/log/SKILL.md has no rule for a name the plan settles');
  // Up to the next numbered step: the example's own "## Факт" is not one.
  const next = /\n## \d+\. /g;
  next.lastIndex = at;
  const rule = text.slice(at, next.exec(text)?.index);
  assert.equal(resolveExercise('подъём на носки', ruDb), null, 'the example must show a name only the plan can settle');
  assert.match(rule, /- Подъём на носки стоя в тренажёре: 3x15 @45/, 'the example shows the plan line that settles it');
  assert.match(rule, /- Подъём на носки стоя в тренажёре: 45x15x3/, 'the example writes the planned canonical name');
  assert.match(rule, /exercise alias --stdin/, 'the reply offers to keep the spelling as an alias');
  assert.match(text, /unless the plan settles it/, 'the closing rules still say names are never resolved silently');
});

// The READMEs promise what the nutrition specialist gives, and the two
// must not drift apart: a README that said "never doses" for food and
// supplements too — when only drugs are never dosed — made an intact
// specialist look gutted. The doses it quotes are the agent's own.
test("the READMEs quote the nutrition specialist's own supplement doses", () => {
  const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const agent = read('agents/nutrition.md');
  assert.match(agent, /\*\*Creatine monohydrate\*\* — 3–5 g\/day/);
  assert.match(agent, /\*\*Caffeine\*\* — 3–6 mg\/kg/);
  assert.match(agent, /\*\*Never\*\* provide\s+protocols, doses, schedules, cycle design, or sourcing/);
  assert.match(read('README.md'), /creatine\s+3–5 g a day, caffeine 3–6 mg\/kg/);
  assert.match(read('README.ru.md'), /креатин 3–5 г в день, кофеин\s+3–6 мг\/кг/);
});

// Each README opens on a demo in its own language. An image a README shows
// but the repository lacks renders on GitHub as a broken icon, and nothing
// else warns about it: a GIF left uncommitted fails here, in CI.
test('each README shows its own demo, and every image it shows is in the repository', () => {
  const ROOT = fileURLToPath(new URL('../', import.meta.url));
  for (const [readme, demo] of [['README.md', 'media/demo.gif'], ['README.ru.md', 'media/demo-ru.gif']]) {
    const text = readFileSync(join(ROOT, readme), 'utf8');
    assert.ok(text.includes(`<img src="${demo}"`), `${readme} does not show ${demo}`);
    for (const [, src] of text.matchAll(/<img\s[^>]*?src="([^"]+)"/g)) {
      if (/^https?:/.test(src)) continue;
      assert.ok(existsSync(join(ROOT, src)), `${readme} shows ${src}, which is not in the repository`);
    }
  }
});

// Duration and feel change no record and no load, so a session is never
// held back for them: on the commonest path — sets dictated, nothing else —
// asking first meant nothing was written until the athlete answered a
// question that was optional all along. The file comes first; the question
// comes last in the reply, where it can go unanswered.
test('log writes the session before it asks for duration and feel', () => {
  const text = readFileSync(join(SKILLS_DIR, 'log', 'SKILL.md'), 'utf8');
  assert.match(text, /`duration_min` and `feel` \(1–5\) never hold the file back/);
  assert.match(text.slice(text.indexOf('## 9. Reply')), /\*\*Duration and feel\*\*/);
});

// The public repository ships the plugin, its tests and CI; the design
// specs, research notes, audits and evals stay with the maintainers. So
// nothing the plugin reads at runtime, no provenance it shows, and no
// comment a contributor reads may point into those documents.
test('nothing public points into the maintainers\' local documents', () => {
  const ROOT = fileURLToPath(new URL('../', import.meta.url));
  const listed = (dir) => readdirSync(join(ROOT, dir), { recursive: true }).map((f) => join(dir, String(f)));
  const files = ['skills', 'agents', 'hooks', 'knowledge', 'templates', 'scripts', 'tests', '.github']
    .flatMap(listed)
    .concat(['README.md', 'README.ru.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md'])
    .filter((f) => /\.(md|mjs|json|ya?ml)$/.test(f))
    // The two files that run the evals stay local with them.
    .filter((f) => !/^tests[\\/]evals\.test\.mjs$|^\.github[\\/]workflows[\\/]evals\.yml$/.test(f));
  // \s, [-] and \/ keep each pattern from spelling what it looks for, so
  // this file never matches its own source.
  const LOCAL = /(^|[^\w/.])(docs|evals)\/|\b[0-9]{2}-[a-z][a-z0-9-]*\.md\b|[a-z]-[a-z-]+\.md\s§|research\snotes\son\s[^\]`)]*(\.md|[–-]§)|\bspec\s§|design\sspec|\baudit\s(F\d|§)|remaining[-]work|[Rr]elease\sreview|final\sreview/;
  const offenders = files.filter((f) => LOCAL.test(readFileSync(join(ROOT, f), 'utf8')));
  assert.deepEqual(offenders, []);
});
