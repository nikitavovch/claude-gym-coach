import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, copyFileSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveExercise } from '../scripts/lib/exercises.mjs';
import { loadConfig, resolveAthlete, loadDb, loadAthlete, profileFreshness, CoachError } from '../scripts/lib/data.mjs';
import { brief, recent, validate, exercises, report, bodyweight, phase, catalog, parseSince, exportRows, exerciseAdd, exerciseAlias } from '../scripts/lib/commands.mjs';
import { formatBrief, formatExercises, formatRecent, formatReport, formatValidate, formatBodyweight, formatPhase, formatCatalog, formatCsv } from '../scripts/lib/format.mjs';

const DIR = fileURLToPath(new URL('./fixtures/gym/', import.meta.url));
const config = loadConfig(DIR);

// A dedicated fixture for report scenarios that the main gym/ fixture can't
// exercise: a gap week with no closed session, and enough sessions (one
// before the period, three inside it) that an early e1RM ceiling ages out
// of the trailing-three smoothing window during the period.
const REPORT_DIR = fileURLToPath(new URL('./fixtures/gym-report/', import.meta.url));
const reportConfig = loadConfig(REPORT_DIR);

test('config reads both athletes', () => {
  assert.deepEqual(Object.keys(config.athletes).sort(), ['danila', 'vera']);
  assert.equal(config.defaultAthlete, 'danila');
});

test('athlete resolves by id, by name and by default', () => {
  assert.equal(resolveAthlete(config, 'vera'), 'vera');
  assert.equal(resolveAthlete(config, 'Вера'), 'vera');
  assert.equal(resolveAthlete(config, null), 'danila');
});

test('unknown athlete lists the known ones', () => {
  assert.throws(() => resolveAthlete(config, 'petya'), (e) => e instanceof CoachError && /danila/.test(e.message));
});

test('brief reports the last session and the open plan', () => {
  const r = brief(DIR, config, '2026-01-26');
  const n = r.athletes.find((a) => a.id === 'danila');
  assert.equal(n.last, '2026-01-19');
  assert.equal(n.lastSession, 'Upper A');
  assert.equal(n.daysAgo, 7);
  assert.equal(n.total, 3);
  assert.equal(n.todayStatus, 'planned');
});

test('brief keeps athletes separate', () => {
  const r = brief(DIR, config, '2026-01-26');
  assert.equal(r.athletes.find((a) => a.id === 'vera').total, 1);
});

test('recent returns newest first', () => {
  const r = recent(DIR, config, 'danila', 2);
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0].date, '2026-01-26');
  assert.equal(r.rows[0].status, 'planned');
  assert.equal(r.rows[1].date, '2026-01-19');
});

test('validate passes a good file', () => {
  const r = validate([`${DIR}athletes/danila/log/2026-01-05.md`]);
  assert.equal(r.files[0].ok, true);
  assert.equal(r.files[0].exercises, 2);
  assert.equal(r.files[0].sets, 5);
});

test('validate fails the broken file and explains why', () => {
  const r = validate([`${DIR}athletes/danila/log/2026-01-20.md`]);
  assert.equal(r.files[0].ok, false);
  assert.ok(r.files[0].errors.some((e) => /filename/i.test(e)));
  assert.ok(r.files[0].errors.some((e) => /\?\?\?/.test(e)));
});

test('validate warns on an unknown exercise only when a database is passed', () => {
  const path = `${DIR}validate-cases/2026-01-08.md`;

  const withoutDb = validate([path]);
  assert.equal(withoutDb.files[0].ok, true);
  assert.equal(withoutDb.files[0].warnings.some((w) => /unknown exercise/i.test(w)), false);

  const db = loadDb(DIR);
  const withDb = validate([path], db);
  assert.equal(withDb.files[0].ok, true);
  assert.ok(withDb.files[0].warnings.some((w) => /unknown exercise/i.test(w) && /Жим гантелей лёжа/.test(w)));
});

test('validate warns when a main lift set carries no RPE', () => {
  const path = `${DIR}validate-cases/2026-01-09.md`;
  const db = loadDb(DIR);
  const r = validate([path], db);
  assert.equal(r.files[0].ok, true);
  assert.ok(r.files[0].warnings.some((w) => /rpe/i.test(w) && /Жим лёжа/.test(w)));
});

test('brief never prints a negative day count for a future-dated last session', () => {
  const r = brief(DIR, config, '2026-01-10');
  const text = formatBrief(r, config);
  assert.equal(/-\d+\s*days?\s*ago/i.test(text), false);
  assert.ok(/dated in the future/.test(text));
});

test('recent rejects a non-positive count', () => {
  assert.throws(() => recent(DIR, config, 'danila', 0), (e) => e instanceof CoachError && /0/.test(e.message));
  assert.throws(() => recent(DIR, config, 'danila', -1), (e) => e instanceof CoachError && /-1/.test(e.message));
});

test('brief line includes the reference date', () => {
  const r = brief(DIR, config, '2026-01-26');
  const text = formatBrief(r, config);
  assert.ok(text.includes('Today 2026-01-26:'));
});

test('exercises reports history newest first', () => {
  const r = exercises(DIR, config, 'danila', ['Жим лёжа'], 3);
  const item = r.items[0];
  assert.equal(item.canonical, 'Жим лёжа');
  assert.equal(item.main, true);
  assert.equal(item.performances.length, 3);
  assert.equal(item.performances[0].date, '2026-01-19');
});

test('exercises computes a load PR', () => {
  const item = exercises(DIR, config, 'danila', ['Жим лёжа'], 3).items[0];
  assert.equal(item.prLoad, 100);
});

test('exercises resolves an alias', () => {
  const item = exercises(DIR, config, 'danila', ['bench press'], 3).items[0];
  assert.equal(item.canonical, 'Жим лёжа');
});

test('exercises marks an unknown name but still reports it', () => {
  const item = exercises(DIR, config, 'danila', ['Жим ногами'], 3).items[0];
  assert.equal(item.known, false);
  assert.equal(item.performances.length, 0);
});

test('bodyweight work has no e1RM but keeps its history', () => {
  const item = exercises(DIR, config, 'danila', ['Подтягивания'], 3).items[0];
  assert.equal(item.prE1rm, null);
  assert.equal(item.performances.length, 3);
});

test('exercises rejects a non-positive count', () => {
  assert.throws(() => exercises(DIR, config, 'danila', ['Жим лёжа'], 0), (e) => e instanceof CoachError && /0/.test(e.message));
  assert.throws(() => exercises(DIR, config, 'danila', ['Жим лёжа'], -1), (e) => e instanceof CoachError && /-1/.test(e.message));
});

test('exercises with count 1 returns exactly one performance', () => {
  const item = exercises(DIR, config, 'danila', ['Жим лёжа'], 1).items[0];
  assert.equal(item.performances.length, 1);
});

test('exercises reports whether RPE data exists', () => {
  const bench = exercises(DIR, config, 'danila', ['Жим лёжа'], 3).items[0];
  assert.equal(bench.hasRpeData, true);
  const pullups = exercises(DIR, config, 'danila', ['Подтягивания'], 3).items[0];
  assert.equal(pullups.hasRpeData, false);
});

test('formatExercises tells the athlete when no RPE data was ever logged', () => {
  const r = exercises(DIR, config, 'danila', ['Подтягивания'], 3);
  const text = formatExercises(r);
  assert.ok(/no RPE data logged/i.test(text));
  assert.equal(/RPE looks unreliable/i.test(text), false);
});

test('formatExercises keeps the unreliable-RPE line when ratings exist but fail trust', () => {
  const fake = {
    items: [{
      name: 'Test Lift',
      canonical: 'Test Lift',
      known: true,
      main: true,
      prLoad: 100,
      prE1rm: 120,
      prE1rmDate: '2026-01-01',
      smoothed: 120,
      rpeTrusted: false,
      hasRpeData: true,
      performances: [{ date: '2026-01-01', sets: '100x5 @7', e1rm: 120, topLoad: 100 }],
    }],
  };
  const text = formatExercises(fake);
  assert.ok(/RPE looks unreliable/i.test(text));
});

test('parseSince understands weeks, months and dates', () => {
  assert.equal(parseSince('4w', '2026-01-29'), '2026-01-01');
  assert.equal(parseSince('1m', '2026-02-01'), '2026-01-01');
  assert.equal(parseSince('2026-01-10', '2026-02-01'), '2026-01-10');
});

test('report covers only the period', () => {
  const r = report(DIR, config, 'danila', '2026-01-10', '2026-01-26');
  assert.equal(r.since, '2026-01-10');
  const bench = r.mains.find((m) => m.canonical === 'Жим лёжа');
  assert.equal(bench.performances, 2);
});

test('report counts weekly sets by primary muscle', () => {
  const r = report(DIR, config, 'danila', '2026-01-01', '2026-01-26');
  const chest = r.volume.filter((v) => v.muscle === 'chest');
  assert.ok(chest.length >= 1);
  assert.equal(chest[0].sets, 3);
});

test('report compares frequency with the target', () => {
  const r = report(DIR, config, 'danila', '2026-01-01', '2026-01-26');
  assert.equal(r.frequency[0].target, 4);
});

test('report lists fatigue signals when RPE climbs at a constant load', () => {
  const r = report(DIR, config, 'danila', '2026-01-01', '2026-01-26');
  assert.ok(r.fatigueSignals.some((s) => /RPE/i.test(s)));
});

test('parseSince clamps a month-back date to the last valid day of the target month', () => {
  assert.equal(parseSince('1m', '2026-03-31'), '2026-02-28');
  assert.equal(parseSince('1m', '2026-05-31'), '2026-04-30');
  assert.equal(parseSince('1m', '2026-01-15'), '2025-12-15');
});

test('report shows a week with no closed sessions as zero, not missing', () => {
  const r = report(REPORT_DIR, reportConfig, 'danila', '2026-02-09', '2026-03-02');
  const weeks = r.frequency.map((f) => f.week);
  assert.deepEqual(weeks, ['2026-W07', '2026-W08', '2026-W09', '2026-W10']);
  const gapWeek = r.frequency.find((f) => f.week === '2026-W08');
  assert.equal(gapWeek.done, 0);
});

test('report computes weekly tonnage per exercise and excludes bodyweight sets', () => {
  const r = report(REPORT_DIR, reportConfig, 'danila', '2026-02-09', '2026-03-02');
  const bench = r.tonnage.filter((t) => t.exercise === 'Жим лёжа');
  assert.deepEqual(bench.map((t) => t.kg), [1500, 1400, 1300]);
  assert.equal(r.tonnage.some((t) => t.exercise === 'Подтягивания'), false);
});

test('report flags a falling smoothed estimated max as a fatigue signal', () => {
  const r = report(REPORT_DIR, reportConfig, 'danila', '2026-02-09', '2026-03-02');
  assert.ok(r.fatigueSignals.some((s) => /smoothed e1RM fell/i.test(s)));
});

test('report flags falling reps at an unchanged load as a fatigue signal', () => {
  const r = report(REPORT_DIR, reportConfig, 'danila', '2026-02-09', '2026-03-02');
  assert.ok(r.fatigueSignals.some((s) => /reps at 100 kg fell 15 . 13/i.test(s)));
});

test('report over a period that ends before any logged session returns empty volume, tonnage and fatigue signals', () => {
  const r = report(DIR, config, 'danila', '2020-01-01', '2020-01-07');
  assert.equal(r.volume.length, 0, 'volume should be empty');
  assert.equal(r.tonnage.length, 0, 'tonnage should be empty');
  assert.equal(r.fatigueSignals.length, 0, 'fatigue signals should be empty');
});

test('report over a period ending mid-history excludes later sessions from volume and tonnage, while records set inside period are new against earlier history', () => {
  // Period 2026-01-10 to 2026-01-19 covers only part of the logged sessions
  const r = report(DIR, config, 'danila', '2026-01-10', '2026-01-19');
  // Should only include sessions within the period, excluding 2026-01-26
  assert.equal(r.volume.length, 5, 'volume should cover only sessions in period');
  assert.equal(r.tonnage.length, 3, 'tonnage should cover only sessions in period');
  // The squat's first-ever session is on 2026-01-19: a starting point, not a
  // record — the same rule log applies.
  assert.ok(!r.prs.some((p) => p.canonical === 'Присед со штангой'), 'a first-ever performance is not a record');
});

test('report for full period is unchanged — concrete volume and tonnage counts are stable', () => {
  const r = report(DIR, config, 'danila', '2026-01-01', '2026-01-26');
  assert.equal(r.volume.length, 7, 'full period volume rows');
  assert.equal(r.tonnage.length, 4, 'full period tonnage rows');
  assert.deepEqual(r.volume[0], { week: '2026-W02', muscle: 'chest', sets: 3 }, 'first volume entry stable');
});

test('for a period ending mid-history, records list contains no entry dated later than the period end', () => {
  const r = report(DIR, config, 'danila', '2026-01-01', '2026-01-12');
  for (const pr of r.prs) {
    assert.ok(pr.date <= '2026-01-12', `PR date ${pr.date} must not exceed period end`);
  }
});

test('for period ending 2026-01-12, bench reports exactly 2 sessions and squat does not appear in main lifts', () => {
  const r = report(DIR, config, 'danila', '2026-01-01', '2026-01-12');
  const bench = r.mains.find((m) => m.canonical === 'Жим лёжа');
  assert.equal(bench.performances, 2, 'bench should have 2 sessions inside period');
  assert.ok(!r.mains.some((m) => m.canonical === 'Присед со штангой'), 'squat should not appear (all sessions are outside period)');
});

test('a performance with no earlier history is not reported as a record', () => {
  // Period 2026-01-10 to 2026-01-19: squat appears only on 2026-01-19 inside
  // period, and there is no squat before it — nothing was beaten.
  const r = report(DIR, config, 'danila', '2026-01-10', '2026-01-19');
  assert.ok(!r.prs.some((p) => p.canonical === 'Присед со штангой'), 'squat has no earlier value to beat');
});

// --- Warnings must survive from a broken log file all the way to the text
// output, for every command that reads an athlete's log directory. The gym
// fixture's 2026-01-20.md is deliberately broken (filename/date mismatch and
// an unparsable set), so loadAthlete always records a warning for it.

test('recent carries the athlete\'s warnings through to the result', () => {
  const r = recent(DIR, config, 'danila', 5);
  assert.ok(r.warnings.some((w) => /2026-01-20\.md/.test(w)), 'broken log file should be reported as a warning');
});

test('formatRecent prints the warnings block', () => {
  const r = recent(DIR, config, 'danila', 5);
  const text = formatRecent(r);
  assert.match(text, /Warnings:/);
  assert.match(text, /2026-01-20\.md/);
});

test('formatRecent has no Warnings block when there are none', () => {
  const text = formatRecent({ rows: [{ date: '2026-01-01', session: 'A', status: 'done' }], warnings: [] });
  assert.equal(/Warnings:/.test(text), false);
});

test('exercises carries the athlete\'s warnings through to the result', () => {
  const r = exercises(DIR, config, 'danila', ['Жим лёжа'], 3);
  assert.ok(r.warnings.some((w) => /2026-01-20\.md/.test(w)), 'broken log file should be reported as a warning');
});

test('formatExercises prints the warnings block', () => {
  const r = exercises(DIR, config, 'danila', ['Жим лёжа'], 3);
  const text = formatExercises(r);
  assert.match(text, /Warnings:/);
  assert.match(text, /2026-01-20\.md/);
});

test('report\'s warnings reach formatReport\'s output', () => {
  const r = report(DIR, config, 'danila', '2026-01-01', '2026-01-26');
  assert.ok(r.warnings.some((w) => /2026-01-20\.md/.test(w)), 'report() should already carry the warning');
  const text = formatReport(r);
  assert.match(text, /Warnings:/);
  assert.match(text, /2026-01-20\.md/);
});

test('formatReport has no Warnings block when there are none', () => {
  const r = { athlete: 'A', since: '2026-01-01', prs: [], mains: [], stalls: [], volume: [], tonnage: [], frequency: [], fatigueSignals: [], warnings: [] };
  const text = formatReport(r);
  assert.equal(/Warnings:/.test(text), false);
});

// --- exercises reports an all-time performance count, independent of --n,
// so a caller can tell a first-ever entry (not a record) from a genuine
// record without having to request full history.

test('exercises reports the all-time performance count independent of --n', () => {
  const full = exercises(DIR, config, 'danila', ['Жим лёжа'], 3).items[0];
  const narrow = exercises(DIR, config, 'danila', ['Жим лёжа'], 1).items[0];
  assert.equal(full.totalPerformances, 3);
  assert.equal(narrow.totalPerformances, 3, '--n 1 must not shrink the all-time count');
  assert.equal(narrow.performances.length, 1, '--n 1 still limits the returned performance list');
});

test('a first-ever entry has totalPerformances 1, distinguishing it from a real record', () => {
  // "Присед со штангой" appears exactly once in danila's fixture log.
  const item = exercises(DIR, config, 'danila', ['Присед со штангой'], 1).items[0];
  assert.equal(item.totalPerformances, 1);
});

// --- formatValidate had no tests at all before this fix.

test('formatValidate prints an OK line with exercise and set counts', () => {
  const text = formatValidate({ files: [{ path: 'a.md', ok: true, errors: [], warnings: [], exercises: 2, sets: 5 }] });
  assert.match(text, /^OK a\.md — 2 exercises, 5 sets$/m);
});

test('formatValidate prints FAIL and every ERROR line for a broken file', () => {
  const text = formatValidate({
    files: [{ path: 'b.md', ok: false, errors: ['bad set line', 'missing key'], warnings: [], exercises: 0, sets: 0 }],
  });
  assert.match(text, /^FAIL b\.md$/m);
  assert.match(text, /ERROR bad set line/);
  assert.match(text, /ERROR missing key/);
});

test('formatValidate prints a WARN line for each warning on an otherwise OK file', () => {
  const text = formatValidate({
    files: [{ path: 'c.md', ok: true, errors: [], warnings: ['unknown exercise "Foo"'], exercises: 1, sets: 1 }],
  });
  assert.match(text, /WARN unknown exercise "Foo"/);
});

// A period with nothing in it is one fact, not thirteen zero rows. The
// zero-filled frequency table is attendance news only when there is
// attendance to compare it against; with no closed session at all it is
// noise that buries the warnings above it.
test('a period with no closed sessions says so once instead of printing zero rows', () => {
  const r = report(DIR, config, 'danila', '4w', '2026-09-22');
  assert.equal(r.sessions, 0);

  const out = formatReport(r);
  assert.match(out, /No closed sessions in this period/);
  assert.doesNotMatch(out, /of 4/);
  assert.doesNotMatch(out, /Personal records/);
});

test('an empty period still shows the phase and the file warnings', () => {
  const out = formatReport(report(DIR, config, 'danila', '4w', '2026-09-22'));
  assert.match(out, /Phase: cut/);
  assert.match(out, /Warnings:/);
});

test('a period with closed sessions keeps the full report', () => {
  const r = report(DIR, config, 'danila', '12w', '2026-01-26');
  assert.ok(r.sessions > 0);
  const out = formatReport(r);
  assert.match(out, /Frequency:/);
  assert.doesNotMatch(out, /No closed sessions/);
});

// Units were collected by `init` and then read by nobody: every weight was
// printed with a hardcoded " kg", so an athlete who answered "lb" was told
// their bench PR was "225 kg". Nothing needs converting — e1RM,
// trends and stalls are ratios, and calc.mjs holds no weight constant — so
// the athlete's own numbers just need the right label.
test('an athlete inherits the folder units, and can override them', () => {
  assert.equal(loadAthlete(DIR, 'danila', config).units, 'kg');
  assert.equal(loadAthlete(DIR, 'danila', { ...config, units: 'lb' }).units, 'lb');

  const perAthlete = {
    ...config,
    units: 'kg',
    athletes: { ...config.athletes, danila: { ...config.athletes.danila, units: 'lb' } },
  };
  assert.equal(loadAthlete(DIR, 'danila', perAthlete).units, 'lb');
  assert.equal(loadAthlete(DIR, 'vera', perAthlete).units, 'kg');
});

test('exercises carries units and the formatter labels every weight with them', () => {
  const inKg = exercises(DIR, config, 'danila', ['Жим лёжа'], 3);
  assert.equal(inKg.units, 'kg');
  assert.match(formatExercises(inKg), /\d kg/);

  const inLb = exercises(DIR, { ...config, units: 'lb' }, 'danila', ['Жим лёжа'], 3);
  assert.equal(inLb.units, 'lb');
  const out = formatExercises(inLb);
  assert.match(out, /\d lb/);
  assert.doesNotMatch(out, /\d kg/);
});

test('report labels records, smoothed e1RM and tonnage with the athlete units', () => {
  const r = report(DIR, { ...config, units: 'lb' }, 'danila', '12w', '2026-01-26');
  assert.equal(r.units, 'lb');
  const out = formatReport(r);
  assert.match(out, /\d lb/);
  assert.doesNotMatch(out, /\d kg/);
});

// --- bodyweight ---------------------------------------------------------

const BW_DIR = fileURLToPath(new URL('./fixtures/gym-bw/', import.meta.url));
const bwConfig = loadConfig(BW_DIR);

test('bodyweight reports the trend, the phase target and the verdict', () => {
  const r = bodyweight(BW_DIR, bwConfig, 'danila', '12w', '2026-08-31');
  assert.equal(r.trend.enough, true);
  assert.equal(r.trend.n, 15);
  assert.equal(r.trend.from, '2026-07-06');
  assert.equal(r.trend.to, '2026-08-31');
  assert.equal(Math.round(r.trend.pctPerWeek * 100) / 100, -0.52);
  assert.equal(r.phase.phase, 'cut');
  assert.equal(r.phase.targetRate, '-0.5%/wk');
  assert.equal(r.verdict, 'on track');
  assert.deepEqual(r.flags, []);
  assert.equal(r.units, 'kg');
});

test('losing faster than 1%/wk is flagged, on top of the verdict', () => {
  const r = bodyweight(BW_DIR, bwConfig, 'vera', '12w', '2026-08-31');
  assert.equal(r.verdict, 'faster than target');
  assert.ok(r.flags.some((f) => /1%\/wk/.test(f)), r.flags.join('|'));
});

test('a period too short to judge reports the entries and no rate', () => {
  const r = bodyweight(BW_DIR, bwConfig, 'danila', '2026-08-24', '2026-08-31');
  assert.equal(r.trend.enough, false);
  assert.equal(r.trend.pctPerWeek, null);
  assert.equal(r.verdict, null);
});

test('an athlete who never logs a weight gets zero entries, not a crash', () => {
  const r = bodyweight(DIR, config, 'danila', '12w', '2026-01-26');
  assert.equal(r.trend.n, 0);
  assert.equal(r.trend.enough, false);
  assert.equal(r.verdict, null);
});

test('formatBodyweight prints the trend, the target and the verdict', () => {
  const out = formatBodyweight(bodyweight(BW_DIR, bwConfig, 'danila', '12w', '2026-08-31'));
  assert.match(out, /15 entries/);
  assert.match(out, /85\.4 → 81\.9 kg/);
  assert.match(out, /-0\.52%\/wk/);
  assert.match(out, /target -0\.5%\/wk/);
  assert.match(out, /on track/);
});

test('formatBodyweight says what is missing when there is not enough data', () => {
  const out = formatBodyweight(bodyweight(BW_DIR, bwConfig, 'danila', '2026-08-24', '2026-08-31'));
  assert.match(out, /not enough data/);
  assert.doesNotMatch(out, /%\/wk\)/);
});

test('phase carries the bodyweight trend since the phase started', () => {
  const r = phase(BW_DIR, bwConfig, 'danila', '2026-08-31');
  assert.equal(r.bodyweight.trend.enough, true);
  // The phase opened 2026-07-06; the trend must start there, not earlier.
  assert.equal(r.bodyweight.trend.from, '2026-07-06');
  assert.equal(r.bodyweight.verdict, 'on track');
  assert.match(formatPhase(r), /bodyweight/i);
  assert.match(formatPhase(r), /on track/);
});

test('a past phase asked for with --at gets no bodyweight verdict', () => {
  // Judging a closed period is what `report` is for; `phase --at` answers
  // "what was I doing then", not "am I on track".
  const r = phase(BW_DIR, bwConfig, 'danila', '2026-08-31', '2026-08-01');
  assert.equal(r.bodyweight, null);
});

test('report includes the bodyweight block for the period', () => {
  const r = report(BW_DIR, bwConfig, 'danila', '12w', '2026-08-31');
  assert.equal(r.bodyweight.trend.n, 15);
  const out = formatReport(r);
  assert.match(out, /Bodyweight:/);
  assert.match(out, /-0\.52%\/wk/);
});

test('report with no logged weights says nothing about bodyweight', () => {
  const out = formatReport(report(DIR, config, 'danila', '12w', '2026-01-26'));
  assert.doesNotMatch(out, /Bodyweight/);
});

// --- profile freshness ------------------------------------------------
//
// Modifiers — injuries, schedule, preferences, age — are read from
// profile.md by all four program specialists as if they were current, and
// nothing outside init ever asks again. The code cannot know whether they
// are still true, but it can say how long it has been since anyone asked.

test('a profile records when it was last confirmed, and how long ago that was', () => {
  const p = profileFreshness(BW_DIR, 'danila', '2026-09-22');
  assert.equal(p.exists, true);
  // The latest entry wins, not the first.
  assert.equal(p.lastChecked, '2026-08-20');
  assert.equal(p.weeksAgo, 4);
  assert.equal(p.stale, false);
});

test('a profile last confirmed long ago is stale', () => {
  const p = profileFreshness(DIR, 'danila', '2026-01-26');
  assert.equal(p.lastChecked, '2025-11-02');
  assert.equal(p.weeksAgo, 12);
  assert.equal(p.stale, true);
});

test('a profile with no Checked section is stale, not an error', () => {
  const p = profileFreshness(BW_DIR, 'vera', '2026-09-22');
  assert.equal(p.exists, true);
  assert.equal(p.lastChecked, null);
  assert.equal(p.weeksAgo, null);
  assert.equal(p.stale, true);
});

test('a missing profile is reported as missing, not as stale data', () => {
  const p = profileFreshness(DIR, 'vera', '2026-01-26');
  assert.equal(p.exists, false);
  assert.equal(p.stale, true);
});

test('report carries the profile freshness so review can act on it', () => {
  const r = report(DIR, config, 'danila', '12w', '2026-01-26');
  assert.equal(r.profile.stale, true);
  assert.match(formatReport(r), /profile last confirmed 2025-11-02 \(12 weeks ago\)/i);
});

// --- catalog ----------------------------------------------------------
//
// The program specialists read all of knowledge/exercises.md — 9958 words —
// to pick exercises. Two thirds of that they cannot use: alias columns
// exist so `log` and `import` can resolve dictation, and a specialist
// picking from a list never resolves anything. `catalog` is the same
// source, projected to the columns and rows the task actually needs.

test('catalog lists exercises without the alias columns a picker cannot use', () => {
  const c = catalog({});
  assert.ok(c.exercises.length > 150, `got ${c.exercises.length}`);
  const squat = c.exercises.find((e) => e.name === 'Back Squat');
  assert.ok(squat.equipment.includes('barbell'));
  assert.equal(squat.main, true);
  assert.ok(squat.pattern);
  assert.ok(squat.primaryMuscle);
  assert.equal(squat.aliases, undefined);
  assert.equal(squat.aliasesRu, undefined);
});

test('catalog filters to what the gym can actually do', () => {
  const all = catalog({});
  const dumbbellsOnly = catalog({ equipment: ['dumbbell', 'bodyweight', 'bench'] });
  assert.ok(dumbbellsOnly.exercises.length < all.exercises.length);
  for (const e of dumbbellsOnly.exercises) {
    assert.ok(
      e.equipment.some((eq) => ['dumbbell', 'bodyweight', 'bench'].includes(eq.split(':')[0])),
      `${e.name} needs ${e.equipment.join(',')}`,
    );
  }
  assert.ok(!dumbbellsOnly.exercises.some((e) => e.name === 'Back Squat'));
});

test('catalog can narrow to the main lifts', () => {
  const mains = catalog({ main: true });
  assert.ok(mains.exercises.every((e) => e.main));
  assert.ok(mains.exercises.some((e) => e.name === 'Back Squat'));
});

test('catalog names exercises in the athlete language', () => {
  const ru = catalog({ lang: 'ru' });
  assert.ok(ru.exercises.some((e) => e.name === 'Присед со штангой на спине'), ru.exercises[0].name);
  // The English catalogue must not leak Russian names, and vice versa.
  assert.ok(!ru.exercises.some((e) => e.name === 'Back Squat'));
});

test('formatCatalog is a table, and much smaller than the file it projects', () => {
  const out = formatCatalog(catalog({}));
  assert.match(out, /^\| Exercise \|/m);
  const words = out.split(/\s+/).length;
  assert.ok(words < 4000, `catalog output is ${words} words`);
  assert.doesNotMatch(out, /Aliases/);
});

// A substitute the gym cannot build is worse than no substitute: it sends
// the specialist to an exercise the athlete has no equipment for.
test('catalog drops substitutes the filtered gym cannot do', () => {
  const dumbbells = catalog({ equipment: ['dumbbell', 'bodyweight', 'bench'] });
  const names = new Set(dumbbells.exercises.map((e) => e.name));
  for (const e of dumbbells.exercises) {
    for (const sub of e.substitutes) {
      assert.ok(names.has(sub), `${e.name} lists ${sub}, which this gym cannot do`);
    }
  }
});

// The specialist writes program.md in the athlete's language, so a Russian
// catalogue whose substitutes are English names would put English into a
// Russian programme.
test('a Russian catalog names substitutes in Russian too', () => {
  const ru = catalog({ lang: 'ru', main: true });
  const squat = ru.exercises.find((e) => e.name === 'Присед со штангой на спине');
  assert.ok(squat.substitutes.length);
  assert.ok(squat.substitutes.every((sub) => /[а-яё]/i.test(sub)), squat.substitutes.join(', '));
});

// §3.1 marks `bench` and `rack` as accessories "combined with
// barbell/dumbbell/bodyweight"; everything else in the column is an
// alternative. So an exercise is possible when the gym has at least one of
// its primary options AND every accessory it needs. Matching on "any
// overlap" let a barbell box squat through a dumbbell-only gym on the
// strength of owning a bench.
test('catalog needs one primary option and every accessory, not any overlap', () => {
  const dumbbells = catalog({ equipment: ['dumbbell', 'bodyweight', 'bench'] });
  const names = dumbbells.exercises.map((e) => e.name);
  assert.ok(!names.includes('Box Squat'), 'box squat needs a barbell and a rack');
  assert.ok(names.includes('Dumbbell Bench Press'), 'dumbbell + bench is exactly this gym');

  const noBench = catalog({ equipment: ['dumbbell', 'bodyweight'] });
  assert.ok(!noBench.exercises.some((e) => e.name === 'Dumbbell Bench Press'), 'no bench, no bench press');
});

// Cardio, session time and the miss marker were
// parsed and then dropped by every command — nothing downstream read them.

test('exercises carries the miss marker of each performance', () => {
  const r = exercises(REPORT_DIR, reportConfig, 'danila', ['Жим лёжа'], 2);
  const [last, prev] = r.items[0].performances;
  assert.equal(last.miss, 'середина');
  assert.equal(prev.miss, null);
  assert.match(formatExercises(r), /2026-03-02: .*\(miss: середина\)/);
});

test('report lists the misses inside the period', () => {
  const r = report(REPORT_DIR, reportConfig, 'danila', '2026-02-09', '2026-03-02');
  assert.deepEqual(r.misses, [{ canonical: 'Жим лёжа', date: '2026-03-02', where: 'середина' }]);
  assert.match(formatReport(r), /Misses:\n {2}Жим лёжа 2026-03-02: середина/);
});

test('report sums cardio per week, inside the period only', () => {
  const r = report(REPORT_DIR, reportConfig, 'danila', '2026-02-09', '2026-03-02');
  assert.deepEqual(r.cardio.weeks, [
    { week: '2026-W07', sessions: 1, minutes: 25, hard: 0, unrated: 1 },
    { week: '2026-W09', sessions: 1, minutes: 30, hard: 0, unrated: 0 },
    { week: '2026-W10', sessions: 1, minutes: 20, hard: 1, unrated: 0 },
  ]);
});

test('report gives the gap between same-day cardio and lifting, in hours', () => {
  const r = report(REPORT_DIR, reportConfig, 'danila', '2026-02-09', '2026-03-02');
  assert.deepEqual(r.cardio.sameDay, [
    { date: '2026-02-09', modality: 'Велосипед', minutes: 25, intensity: null, gapHours: null, order: null },
    { date: '2026-02-23', modality: 'Бег', minutes: 30, intensity: 'easy', gapHours: 10.5, order: 'before' },
    { date: '2026-03-02', modality: 'Гребля', minutes: 20, intensity: 'hard', gapHours: 1.5, order: 'before' },
  ]);
  const out = formatReport(r);
  assert.match(out, /Cardio:\n {2}2026-W07: 1 session, 25 min, 0 hard, 1 unrated/);
  assert.match(out, /2026-03-02: Гребля 20 min \(hard\), 1\.5 h before lifting/);
  assert.match(out, /2026-02-09: Велосипед 25 min, times not logged/);
});

test('a report with no cardio prints no cardio block', () => {
  const r = report(DIR, config, 'danila', '2026-01-01', '2026-01-20');
  assert.deepEqual(r.cardio, { weeks: [], sameDay: [] });
  assert.deepEqual(r.misses, []);
  const out = formatReport(r);
  assert.doesNotMatch(out, /Cardio:|Misses:/);
});

// A cardio-only day is a closed session with
// no lifting in it. It must not stand in for the last lifting session —
// plan's rotation reads that — nor count toward days_per_week, which is a
// lifting target; its cardio still counts.

test('brief names the last lifting session, not a later cardio-only day', () => {
  const b = brief(REPORT_DIR, reportConfig, '2026-03-03');
  const a = b.athletes[0];
  assert.equal(a.last, '2026-03-02');
  assert.equal(a.lastSession, 'Upper A');
  assert.equal(a.total, 4);
  assert.equal(a.todayStatus, 'done');
  assert.equal(a.todaySession, 'Кардио');
});

test('recent marks a cardio-only day so rotation can skip it', () => {
  const r = recent(REPORT_DIR, reportConfig, 'danila', 2);
  assert.equal(r.rows[0].date, '2026-03-03');
  assert.equal(r.rows[0].cardioOnly, true);
  assert.equal(r.rows[1].cardioOnly, false);
  assert.match(formatRecent(r), /^2026-03-03 {2}Кардио {2}done {2}cardio only$/m);
});

test('a cardio-only day counts its cardio but not toward the lifting frequency', () => {
  const r = report(REPORT_DIR, reportConfig, 'danila', '2026-02-09', '2026-03-03');
  assert.equal(r.frequency.find((f) => f.week === '2026-W10').done, 1);
  assert.equal(r.sessions, 3);
  assert.deepEqual(r.cardio.weeks.find((w) => w.week === '2026-W10'),
    { week: '2026-W10', sessions: 2, minutes: 65, hard: 1, unrated: 0 });
  assert.ok(!r.cardio.sameDay.some((s) => s.date === '2026-03-03'), 'a day without lifting is not a lifting day');
});

test('a period with only cardio says so, and still shows the cardio', () => {
  const r = report(REPORT_DIR, reportConfig, 'danila', '2026-03-03', '2026-03-03');
  assert.equal(r.sessions, 0);
  const out = formatReport(r);
  assert.match(out, /No lifting sessions in this period\./);
  assert.match(out, /Cardio:\n {2}2026-W10: 1 session, 45 min, 0 hard/);
  assert.doesNotMatch(out, /Frequency:/);
});

test('validate counts cardio lines on a cardio-only file', () => {
  const r = validate([fileURLToPath(new URL('./fixtures/gym-report/athletes/danila/log/2026-03-03.md', import.meta.url))]);
  assert.equal(r.files[0].ok, true);
  assert.equal(r.files[0].cardio, 1);
  assert.match(formatValidate(r), /— 0 exercises, 0 sets, 1 cardio$/m);
});

test('exercises carries rep records from the whole history, whatever --n says', () => {
  const r = exercises(REPORT_DIR, reportConfig, 'danila', ['Жим лёжа'], 1);
  const records = r.items[0].repRecords;
  assert.deepEqual(records.map((x) => x.reps), [1, 2, 3, 4, 5]);
  assert.deepEqual(records[4], { reps: 5, load: 100, date: '2026-02-02', previous: null });
  assert.match(formatExercises(r), /^ {2}Rep records \(kg\): 1–5: 100$/m);
});

test('formatExercises runs rep counts that share a load together', () => {
  const item = {
    canonical: 'Присед', main: true, known: true, prLoad: 140, prE1rm: 150, prE1rmDate: '2026-01-01',
    smoothed: 150, rpeTrusted: true, hasRpeData: true, totalPerformances: 3,
    performances: [{ date: '2026-01-01', sets: '140x1', e1rm: 140, miss: null }],
    repRecords: [
      { reps: 1, load: 140, date: 'a', previous: null },
      { reps: 2, load: 120, date: 'b', previous: null },
      { reps: 3, load: 120, date: 'b', previous: null },
      { reps: 4, load: 100, date: 'c', previous: null },
    ],
  };
  assert.match(formatExercises({ units: 'kg', items: [item], warnings: [] }), /Rep records \(kg\): 1: 140, 2–3: 120, 4: 100/);
});

// export: a way into spreadsheets and charts that keeps the
// files themselves the only source — every figure still comes from here.

test('export sets gives one row per set, with the canonical name and its e1RM', () => {
  const r = exportRows(REPORT_DIR, reportConfig, 'danila', 'sets', null, '2026-03-03');
  assert.equal(r.rows.length, 16);
  assert.deepEqual(r.columns, ['date', 'session', 'exercise', 'set', 'load', 'bodyweight_set', 'bw_offset', 'reps', 'rpe', 'e1rm', 'units', 'note', 'miss']);
  const last = r.rows.at(-1);
  assert.equal(last.date, '2026-03-02');
  assert.equal(last.exercise, 'Жим лёжа');
  assert.equal(last.set, 3);
  assert.equal(last.miss, 'середина');
  const pullup = r.rows.find((x) => x.exercise === 'Подтягивания');
  assert.equal(pullup.load, null);
  assert.equal(pullup.bodyweight_set, true);
  assert.equal(pullup.e1rm, null);
});

test('export honours --since and exports all history without it', () => {
  assert.equal(exportRows(REPORT_DIR, reportConfig, 'danila', 'sets', '2026-02-09', '2026-03-03').rows.length, 13);
});

test('export sessions lists every file, cardio-only and planned ones included', () => {
  const r = exportRows(REPORT_DIR, reportConfig, 'danila', 'sessions', null, '2026-03-03');
  assert.equal(r.rows.length, 5);
  const run = r.rows.find((x) => x.date === '2026-03-03');
  assert.deepEqual(
    { exercises: run.exercises, sets: run.sets, cardio_min: run.cardio_min, bodyweight: run.bodyweight },
    { exercises: 0, sets: 0, cardio_min: 45, bodyweight: 83.1 },
  );
});

test('export cardio gives one row per cardio line with its intensity', () => {
  const r = exportRows(REPORT_DIR, reportConfig, 'danila', 'cardio', null, '2026-03-03');
  assert.equal(r.rows.length, 5);
  const row = r.rows.find((x) => x.modality === 'Гребля');
  assert.deepEqual({ minutes: row.minutes, rpe: row.rpe, time: row.time, intensity: row.intensity },
    { minutes: 20, rpe: 8, time: '17:00', intensity: 'hard' });
});

test('export names the tables it knows when given another', () => {
  assert.throws(() => exportRows(REPORT_DIR, reportConfig, 'danila', 'meals', null, '2026-03-03'),
    (e) => e instanceof CoachError && /sets, sessions or cardio/.test(e.message));
});

test('formatCsv quotes what RFC 4180 needs quoted and leaves the rest alone', () => {
  const csv = formatCsv({
    columns: ['a', 'b', 'c', 'd'],
    rows: [{ a: 'plain', b: 'has, comma', c: 'say "hi"', d: null }, { a: 'two\nlines', b: true, c: 7.5, d: '' }],
  });
  assert.equal(csv, 'a,b,c,d\r\nplain,"has, comma","say ""hi""",\r\n"two\nlines",true,7.5,\r\n');
});

// exercise add/alias write the folder's own exercises.md, so each test gets
// a throwaway copy of the fixture folder.
function scratchFolder() {
  const d = mkdtempSync(join(tmpdir(), 'coach-exercise-'));
  copyFileSync(join(DIR, '.coach.json'), join(d, '.coach.json'));
  copyFileSync(join(DIR, 'exercises.md'), join(d, 'exercises.md'));
  return d;
}

test('exercise add writes the row, and the table resolves it at once', () => {
  const d = scratchFolder();
  const r = exerciseAdd(d, loadConfig(d), { name: 'Тяга с плинтов', aliases: ['тяга с блоков'], equipment: ['barbell'], muscles: ['back-lats'], main: false });
  assert.equal(r.action, 'added');
  assert.equal(resolveExercise('тяга с блоков', loadDb(d)).canonical, 'Тяга с плинтов');
  assert.match(readFileSync(join(d, 'exercises.md'), 'utf8'), /## Свои упражнения/);
});

test('exercise add refuses a taken name and leaves the file as it was', () => {
  const d = scratchFolder();
  const before = readFileSync(join(d, 'exercises.md'), 'utf8');
  assert.throws(
    () => exerciseAdd(d, loadConfig(d), { name: 'присед', equipment: ['barbell'], muscles: ['quads'] }),
    (e) => e instanceof CoachError && /Присед со штангой/.test(e.message),
  );
  assert.equal(readFileSync(join(d, 'exercises.md'), 'utf8'), before);
});

test('exercise alias teaches an existing exercise another name', () => {
  const d = scratchFolder();
  const r = exerciseAlias(d, loadConfig(d), 'присед', ['приседания со штангой']);
  assert.deepEqual(r, { action: 'aliased', canonical: 'Присед со штангой', added: ['приседания со штангой'] });
  assert.equal(resolveExercise('приседания со штангой', loadDb(d)).canonical, 'Присед со штангой');
});

// A cell a spreadsheet would read as a formula runs when the athlete opens
// their own export (OWASP "CSV injection"). Text cells starting with one of
// its trigger characters get a leading apostrophe; numbers never do.
test('formatCsv defuses text that a spreadsheet would run as a formula', () => {
  const csv = formatCsv({
    columns: ['note', 'offset', 'plain'],
    rows: [{ note: '=HYPERLINK("http://x","y")', offset: -10, plain: '+ok' }, { note: '@SUM(1)', offset: 5, plain: '-сильно' }],
  });
  assert.equal(csv, `note,offset,plain\r\n"'=HYPERLINK(""http://x"",""y"")",-10,'+ok\r\n'@SUM(1),5,'-сильно\r\n`);
});

test('formatExercises prints an e1RM of zero instead of hiding it', () => {
  const item = { canonical: 'X', main: false, known: true, prLoad: 0, prE1rm: 0, prE1rmDate: 'd', smoothed: 0,
    rpeTrusted: true, hasRpeData: false, totalPerformances: 1, repRecords: [],
    performances: [{ date: '2026-01-01', sets: '0x5', e1rm: 0, miss: null }] };
  assert.match(formatExercises({ units: 'kg', items: [item], warnings: [] }), /0x5 → e1RM 0 kg/);
});

// Found before 1.0, in a hunt for silent failures: bodyweight-loaded main
// lifts, and records that nothing was beaten to earn.
function scratchLogFolder(days) {
  const d = mkdtempSync(join(tmpdir(), 'coach-records-'));
  writeFileSync(join(d, '.coach.json'), JSON.stringify({ schema: 1, units: 'kg', language: 'ru', default_athlete: 'a', athletes: { a: { name: 'A', days_per_week: 3 } } }));
  copyFileSync(fileURLToPath(new URL('../templates/ru/exercises.md', import.meta.url)), join(d, 'exercises.md'));
  mkdirSync(join(d, 'athletes', 'a', 'log'), { recursive: true });
  for (const [date, line] of days) {
    writeFileSync(join(d, 'athletes', 'a', 'log', `${date}.md`), `---\ndate: ${date}\nsession: A\nstatus: done\n---\n\n## Факт\n${line}\n`);
  }
  return d;
}

const WEIGHTED_PULLUPS = [
  ['2026-08-03', '- Подтягивания прямым хватом: BW+10x5x3 @8'],
  ['2026-08-10', '- Подтягивания прямым хватом: BW+15x5x3 @8'],
  ['2026-08-17', '- Подтягивания прямым хватом: BW+20x5x3 @8'],
  ['2026-08-24', '- Подтягивания прямым хватом: BW+25x5x3 @8'],
];

test('added load on a bodyweight lift is progress, not a stall', () => {
  const d = scratchLogFolder(WEIGHTED_PULLUPS);
  const r = report(d, loadConfig(d), 'a', '2026-08-01', '2026-08-30');
  assert.ok(!r.stalls.includes('Подтягивания прямым хватом'), `stalls: ${r.stalls.join(', ')}`);
});

test('a weighted bodyweight lift has an added-load record and rep records by added load', () => {
  const d = scratchLogFolder(WEIGHTED_PULLUPS);
  const r = exercises(d, loadConfig(d), 'a', ['подтягивания'], 1);
  const item = r.items[0];
  assert.equal(item.prAddedLoad, 25);
  assert.deepEqual(item.repRecords.find((x) => x.reps === 5), { reps: 5, load: 25, date: '2026-08-24', previous: 20, bw: true });
  const out = formatExercises(r);
  assert.match(out, /PR load BW\+25 kg/);
  assert.match(out, /Rep records \(BW\+kg\): 1–5: 25/);
});

test('a lighter set after sessions with no e1RM is not a record', () => {
  // 14x15 has more than ten effective reps, so no e1RM; that must not
  // count as zero and make 10x6 look like a record.
  const d = scratchLogFolder([
    ['2026-08-03', '- Разведение гантелей в стороны: 14x15x3'],
    ['2026-08-10', '- Разведение гантелей в стороны: 14x15x3'],
    ['2026-08-24', '- Разведение гантелей в стороны: 10x6x3'],
  ]);
  const r = report(d, loadConfig(d), 'a', '2026-08-20', '2026-08-30');
  assert.deepEqual(r.prs, []);
});

test('one unreadable set line costs that line, not the whole day', () => {
  const d = scratchLogFolder([
    ['2026-08-03', '- Жим штанги лёжа: 100x5x3 @8\n- Присед со штангой на спине: 120x5 @8, 1200x5'],
  ]);
  const a = loadAthlete(d, 'a', loadConfig(d));
  assert.equal(a.days.length, 1, a.warnings.join('; '));
  assert.equal(a.days[0].actual.length, 1, 'the readable exercise stays');
  assert.ok(a.warnings.some((w) => /line \d+/.test(w)), a.warnings.join('; '));
  assert.equal(validate([join(d, 'athletes', 'a', 'log', '2026-08-03.md')]).files[0].ok, false, 'validate still fails the file');
});

test('one unknown exercise written three ways is one exercise, and report names it', () => {
  const d = scratchLogFolder([
    ['2026-08-03', '- Жим Ларсена: 80x5x3'],
    ['2026-08-10', '- жим ларсена: 82.5x5x3'],
    ['2026-08-17', '- ЖИМ ЛАРСЕНА: 85x5x3'],
  ]);
  const r = report(d, loadConfig(d), 'a', '2026-08-01', '2026-08-20');
  assert.equal(new Set(r.tonnage.map((t) => t.exercise)).size, 1, JSON.stringify(r.tonnage));
  assert.ok(r.warnings.some((w) => /not in exercises\.md/.test(w) && /Жим Ларсена/.test(w)), r.warnings.join('; '));
  const e = exercises(d, loadConfig(d), 'a', ['жим ларсена'], 5);
  assert.equal(e.items[0].totalPerformances, 3);
});

test('a folder with no exercises.md says so instead of calling every lift unknown', () => {
  const d = scratchLogFolder([['2026-08-03', '- Жим штанги лёжа: 100x5x3 @8']]);
  rmSync(join(d, 'exercises.md'));
  const r = report(d, loadConfig(d), 'a', '2026-08-01', '2026-08-20');
  assert.ok(r.warnings.some((w) => /no exercises\.md/.test(w)), r.warnings.join('; '));
});

// What log and review need from exercises and
// report, computed here rather than eyeballed in a prompt.
const BENCH_WEEKS = [
  ['2026-08-03', '- Жим штанги лёжа: 100x5x3 @8'],
  ['2026-08-10', '- Жим штанги лёжа: 100x5x3 @8'],
  ['2026-08-17', '- Жим штанги лёжа: 102.5x5x3 @8.5 — левое плечо кольнуло на последнем'],
];

test('exercises carries each performance note, so a pain remark reaches plan and review', () => {
  const d = scratchLogFolder(BENCH_WEEKS);
  const r = exercises(d, loadConfig(d), 'a', ['жим лёжа'], 1);
  assert.equal(r.items[0].performances[0].note, 'левое плечо кольнуло на последнем');
  assert.match(formatExercises(r), /— левое плечо кольнуло на последнем/);
});

test('exercises says how long since the last performance, given today', () => {
  const d = scratchLogFolder(BENCH_WEEKS);
  const r = exercises(d, loadConfig(d), 'a', ['жим лёжа'], 1, '2026-09-07');
  assert.equal(r.items[0].daysSinceLast, 21);
});

test('the latest performance says, in code, whether it set a record and how far its load moved', () => {
  const d = scratchLogFolder(BENCH_WEEKS);
  const latest = exercises(d, loadConfig(d), 'a', ['жим лёжа'], 1).items[0].latest;
  assert.equal(latest.date, '2026-08-17');
  assert.equal(latest.newLoadRecord, true);
  assert.equal(latest.newE1rmRecord, true);
  assert.deepEqual(latest.newRepRecords.map((x) => x.reps), [1, 2, 3, 4, 5]);
  assert.equal(latest.loadChangePct, 2.5);
});

test('matching an earlier best is not a record', () => {
  const d = scratchLogFolder(BENCH_WEEKS.slice(0, 2));
  const latest = exercises(d, loadConfig(d), 'a', ['жим лёжа'], 1).items[0].latest;
  assert.equal(latest.newLoadRecord, false);
  assert.equal(latest.newE1rmRecord, false);
  assert.deepEqual(latest.newRepRecords, []);
});

test('a first-ever performance has nothing to beat and no load change', () => {
  const d = scratchLogFolder(BENCH_WEEKS.slice(0, 1));
  const latest = exercises(d, loadConfig(d), 'a', ['жим лёжа'], 1).items[0].latest;
  assert.equal(latest.newLoadRecord, false);
  assert.equal(latest.loadChangePct, null);
});

test('report compares each main lift with its level six to eight weeks earlier', () => {
  const d = scratchLogFolder([
    ['2026-07-13', '- Присед со штангой на спине: 120x5x3 @8'],
    ['2026-07-20', '- Присед со штангой на спине: 120x5x3 @8'],
    ['2026-08-31', '- Присед со штангой на спине: 125x5x3 @8'],
    ['2026-09-07', '- Присед со штангой на спине: 127.5x5x3 @8'],
  ]);
  const r = report(d, loadConfig(d), 'a', '2026-08-24', '2026-09-07');
  const squat = r.mains.find((m) => m.canonical === 'Присед со штангой на спине');
  assert.ok(squat.anchor, JSON.stringify(squat));
  assert.equal(squat.anchor.from, '2026-07-13');
  assert.ok(squat.anchor.changePct > 5 && squat.anchor.changePct < 7, String(squat.anchor.changePct));
  assert.match(formatReport(r), /vs 6–8 weeks earlier \+\d/);
});

test('report lists the notes written on lift lines in the period', () => {
  const d = scratchLogFolder(BENCH_WEEKS);
  const r = report(d, loadConfig(d), 'a', '2026-08-01', '2026-08-20');
  assert.deepEqual(r.notes, [{ canonical: 'Жим штанги лёжа', date: '2026-08-17', note: 'левое плечо кольнуло на последнем' }]);
  assert.match(formatReport(r), /Notes on lifts:\n {2}Жим штанги лёжа 2026-08-17: левое плечо/);
});

// The templates' own example line has no leading "- "; a confirmation
// written that way was invisible, and a typo'd date could make a profile
// look fresh for ever.
function profileFolder(checkedLines) {
  const d = mkdtempSync(join(tmpdir(), 'coach-profile-'));
  mkdirSync(join(d, 'athletes', 'a'), { recursive: true });
  writeFileSync(join(d, 'athletes', 'a', 'profile.md'), `# Профиль\n\n## Проверено\n${checkedLines}\n`);
  return d;
}

test('a Checked line without a leading dash still counts', () => {
  const f = profileFreshness(profileFolder('2026-09-20 — подтверждено без изменений'), 'a', '2026-09-23');
  assert.equal(f.lastChecked, '2026-09-20');
  assert.equal(f.stale, false);
});

test('an impossible or future date in Checked is ignored, not taken as fresh', () => {
  const f = profileFreshness(profileFolder('- 2026-13-40 — опечатка\n- 2062-01-01 — опечатка\n- 2026-05-01 — заполнено при настройке'), 'a', '2026-09-23');
  assert.equal(f.lastChecked, '2026-05-01');
  assert.equal(f.stale, true);
});
