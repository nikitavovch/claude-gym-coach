import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePhaseTable } from '../scripts/lib/phases.mjs';
import { loadConfig, loadPhases, currentPhase, phaseAt, dayBefore, setPhase, CoachError, parseTargetRate } from '../scripts/lib/data.mjs';
import { brief, report, phase, phaseSet } from '../scripts/lib/commands.mjs';
import { formatBrief, formatReport, formatPhase, formatPhaseSet } from '../scripts/lib/format.mjs';

const DIR = fileURLToPath(new URL('./fixtures/gym/', import.meta.url));
const config = loadConfig(DIR);

// setPhase() writes files, so every test that calls it gets its own
// throwaway folder — the shared gym/ fixture is read-only in every other
// test file and must stay that way.
function scratchDir() {
  return mkdtempSync(join(tmpdir(), 'coach-phase-'));
}

const WELL_FORMED = `| From | To | Phase | Target rate | Note |
|---|---|---|---|---|
| 2026-01-05 |  | cut | -0.5%/wk | wedding in December |
| 2025-12-01 | 2026-01-04 | bulk | +0.25%/wk | |
`;

// --- parsePhaseTable (pure) ----------------------------------------------

test('parsePhaseTable parses every well-formed row', () => {
  const { rows, warnings } = parsePhaseTable(WELL_FORMED);
  assert.equal(rows.length, 2);
  assert.equal(warnings.length, 0);
  assert.equal(rows[0].phase, 'cut');
  assert.equal(rows[0].to, null);
  assert.equal(rows[1].phase, 'bulk');
  assert.equal(rows[1].to, '2026-01-04');
});

test('parsePhaseTable warns on a malformed row and keeps going', () => {
  const text = `| From | To | Phase | Target rate | Note |
|---|---|---|---|---|
| not-a-date |  | cut | | |
| 2025-12-01 | 2026-01-04 | bulk | | |
`;
  const { rows, warnings } = parsePhaseTable(text);
  assert.equal(rows.length, 1, 'the malformed row is dropped, the good one kept');
  assert.equal(rows[0].phase, 'bulk');
  assert.ok(warnings.some((w) => /row 1/.test(w) && /not-a-date/.test(w)));
});

test('parsePhaseTable warns on an unknown phase name', () => {
  const text = `| From | To | Phase | Target rate | Note |
|---|---|---|---|---|
| 2026-01-01 |  | shred | | |
`;
  const { rows, warnings } = parsePhaseTable(text);
  assert.equal(rows.length, 0);
  assert.ok(warnings.some((w) => /unknown phase/.test(w) && /shred/.test(w)));
});

test('parsePhaseTable warns when more than one row is open', () => {
  const text = `| From | To | Phase | Target rate | Note |
|---|---|---|---|---|
| 2026-02-01 |  | cut | | |
| 2026-01-01 |  | bulk | | |
`;
  const { rows, warnings } = parsePhaseTable(text);
  assert.equal(rows.length, 2, 'both open rows are kept, not dropped');
  assert.ok(warnings.some((w) => /row 2/.test(w) && /more than one open phase/.test(w)));
});

test('parsePhaseTable warns on an overlapping pair of closed rows', () => {
  const text = `| From | To | Phase | Target rate | Note |
|---|---|---|---|---|
| 2026-01-10 | 2026-02-01 | cut | | |
| 2026-01-01 | 2026-01-15 | bulk | | |
`;
  const { rows, warnings } = parsePhaseTable(text);
  assert.equal(rows.length, 2);
  assert.ok(warnings.some((w) => /rows 1 and 2/.test(w) && /overlap/.test(w)));
});

// --- loadPhases / currentPhase / phaseAt (data.mjs) ----------------------

test('loadPhases reports no file for an athlete without phases.md', () => {
  const r = loadPhases(DIR, 'vera');
  assert.equal(r.hasFile, false);
  assert.deepEqual(r.rows, []);
});

test('currentPhase returns maintain with an unknown start when phases.md is missing', () => {
  const r = currentPhase(DIR, 'vera', '2026-01-26');
  assert.equal(r.phase, 'maintain');
  assert.equal(r.from, null);
  assert.equal(r.weeks, null);
  assert.equal(r.hasFile, false);
});

test('currentPhase returns the open phase with its start date and duration', () => {
  const r = currentPhase(DIR, 'danila', '2026-01-26');
  assert.equal(r.phase, 'cut');
  assert.equal(r.from, '2026-01-05');
  assert.equal(r.weeks, 3);
  assert.equal(r.targetRate, '-0.5%/wk');
  assert.equal(r.hasFile, true);
});

test('phaseAt finds the phase covering a date inside the open phase', () => {
  const r = phaseAt(DIR, 'danila', '2026-01-10');
  assert.equal(r.phase, 'cut');
  assert.equal(r.weeks, 0);
});

test('phaseAt finds the phase covering a date inside the closed phase', () => {
  const r = phaseAt(DIR, 'danila', '2025-12-15');
  assert.equal(r.phase, 'bulk');
  assert.equal(r.from, '2025-12-01');
  assert.equal(r.weeks, 2);
});

test('phaseAt before the first row returns maintain with an unknown start', () => {
  const r = phaseAt(DIR, 'danila', '2025-11-01');
  assert.equal(r.phase, 'maintain');
  assert.equal(r.from, null);
  assert.equal(r.weeks, null);
});

// --- dayBefore --------------------------------------------------------------

test('dayBefore crosses a month boundary', () => {
  assert.equal(dayBefore('2026-03-01'), '2026-02-28');
  assert.equal(dayBefore('2026-05-01'), '2026-04-30');
});

test('dayBefore crosses a month boundary in a leap year', () => {
  assert.equal(dayBefore('2024-03-01'), '2024-02-29');
});

test('dayBefore crosses a year boundary', () => {
  assert.equal(dayBefore('2026-01-01'), '2025-12-31');
});

// --- setPhase (data.mjs, the one write path) --------------------------------

test('setPhase creates phases.md when none exists', () => {
  const dir = scratchDir();
  const r = setPhase(dir, 'danila', 'cut', '2026-01-05', '-0.5%/wk');
  assert.equal(r.action, 'opened');
  assert.equal(r.closedPrevious, null);

  const text = readFileSync(join(dir, 'athletes', 'danila', 'phases.md'), 'utf8');
  const { rows, warnings } = parsePhaseTable(text);
  assert.equal(warnings.length, 0);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].phase, 'cut');
  assert.equal(rows[0].from, '2026-01-05');
  assert.equal(rows[0].to, null);
  assert.equal(rows[0].targetRate, '-0.5%/wk');
});

test('setPhase closes the open row and opens a new one in the same call', () => {
  const dir = scratchDir();
  setPhase(dir, 'danila', 'cut', '2026-01-05', null);
  const r = setPhase(dir, 'danila', 'bulk', '2026-03-01', '+0.25%/wk');

  assert.equal(r.action, 'opened');
  assert.deepEqual(r.closedPrevious, { phase: 'cut', from: '2026-01-05', to: '2026-02-28' });

  const text = readFileSync(join(dir, 'athletes', 'danila', 'phases.md'), 'utf8');
  const { rows, warnings } = parsePhaseTable(text);
  assert.equal(warnings.length, 0, warnings.join('; '));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].phase, 'bulk', 'the newly opened phase is the first (newest) row');
  assert.equal(rows[0].to, null);
  assert.equal(rows[1].phase, 'cut');
  assert.equal(rows[1].to, '2026-02-28', 'the closed row ends the day before the new one starts');
});

test('setPhase inserts a new row without touching an existing closed row when nothing is open', () => {
  const dir = scratchDir();
  // Write a phases.md by hand with a single already-closed row — nothing
  // open, so there is nothing for setPhase to close, only to add to.
  setPhase(dir, 'danila', 'cut', '2026-01-05', null);
  setPhase(dir, 'danila', 'bulk', '2026-03-01', null); // closes cut, opens bulk
  // Manually close bulk too, leaving zero open rows.
  const path = join(dir, 'athletes', 'danila', 'phases.md');
  const closedText = readFileSync(path, 'utf8').replace(
    '| 2026-03-01 |  | bulk |  |  |',
    '| 2026-03-01 | 2026-04-01 | bulk |  |  |',
  );
  writeFileSync(path, closedText);

  const r = setPhase(dir, 'danila', 'maintain', '2026-04-02', null);
  assert.equal(r.action, 'opened');
  assert.equal(r.closedPrevious, null, 'nothing was open, so nothing was closed');

  const { rows, warnings } = parsePhaseTable(readFileSync(path, 'utf8'));
  assert.equal(warnings.length, 0, warnings.join('; '));
  assert.equal(rows.length, 3);
  assert.equal(rows[0].phase, 'maintain');
  assert.equal(rows[1].phase, 'bulk');
  assert.equal(rows[1].to, '2026-04-01', 'the pre-existing closed row is untouched');
  assert.equal(rows[2].phase, 'cut');
});

test('setPhase rejects a --from strictly before the open row\'s start', () => {
  const dir = scratchDir();
  setPhase(dir, 'danila', 'cut', '2026-01-10', null);

  assert.throws(
    () => setPhase(dir, 'danila', 'bulk', '2026-01-05', null),
    (e) => e instanceof CoachError && /2026-01-05/.test(e.message) && /2026-01-10/.test(e.message),
    'a from strictly before the open start must be rejected — that is the destructive case',
  );
});

test('setPhase on the already-open phase with the same --from but a different phase replaces it in place', () => {
  const dir = scratchDir();
  setPhase(dir, 'danila', 'maintain', '2026-01-10', null);
  const r = setPhase(dir, 'danila', 'bulk', '2026-01-10', '+0.25%/wk');

  // Same date, different phase is a mislabeling correction, not the
  // destructive case above — the row is replaced in place, never refused,
  // and never silently: the caller learns which phase was replaced.
  assert.equal(r.action, 'replaced');
  assert.equal(r.replaced, 'maintain');
  assert.equal(r.phase, 'bulk');
  assert.equal(r.from, '2026-01-10');
  assert.equal(r.targetRate, '+0.25%/wk');

  const path = join(dir, 'athletes', 'danila', 'phases.md');
  const { rows, warnings } = parsePhaseTable(readFileSync(path, 'utf8'));
  assert.equal(warnings.length, 0, warnings.join('; '));
  assert.equal(rows.length, 1, 'a same-date replacement must not create a second row');
  assert.equal(rows[0].phase, 'bulk');
  assert.equal(rows[0].from, '2026-01-10');
  assert.equal(rows[0].to, null);
  assert.equal(rows[0].targetRate, '+0.25%/wk');

  const text = formatPhaseSet(r);
  assert.match(text, /replaced maintain/);
  assert.match(text, /with bulk/);
});

test('setPhase is a no-op when the requested phase is already open with the same start date', () => {
  const dir = scratchDir();
  setPhase(dir, 'danila', 'cut', '2026-01-05', '-0.5%/wk');
  const r = setPhase(dir, 'danila', 'cut', '2026-01-05', null);

  assert.equal(r.action, 'noop');
  assert.equal(r.phase, 'cut');
  assert.equal(r.from, '2026-01-05');

  const { rows } = parsePhaseTable(readFileSync(join(dir, 'athletes', 'danila', 'phases.md'), 'utf8'));
  assert.equal(rows.length, 1, 'the no-op must not touch the file at all');
  assert.equal(rows[0].targetRate, '-0.5%/wk', 'the original rate survives untouched');
});

test('setPhase rejects an unknown phase name', () => {
  const dir = scratchDir();
  assert.throws(() => setPhase(dir, 'danila', 'shred', '2026-01-05', null), CoachError);
});

test('setPhase rejects an impossible calendar date like Feb 30 instead of writing it', () => {
  const dir = scratchDir();
  assert.throws(
    () => setPhase(dir, 'danila', 'cut', '2026-02-30', null),
    (e) => e instanceof CoachError && /2026-02-30/.test(e.message),
    'a date that matches YYYY-MM-DD but names no real day must still be refused',
  );
  assert.equal(
    existsSync(join(dir, 'athletes', 'danila', 'phases.md')),
    false,
    'a rejected date must leave no file behind, not a row that silently overlaps the next one',
  );
});

test('setPhase rejects an unparseable date with a CoachError, not a raw RangeError', () => {
  const dir = scratchDir();
  setPhase(dir, 'danila', 'cut', '2026-01-05', null); // an open phase, so the bad --from must run through dayBefore() to close it
  assert.throws(
    () => setPhase(dir, 'danila', 'bulk', '2026-13-99', null),
    (e) => e instanceof CoachError && /2026-13-99/.test(e.message),
    'must be a readable CoachError, not the RangeError dayBefore() throws on an invalid Date',
  );
});

test('setPhase on the already-open phase with a different --from corrects the start date instead of resetting history', () => {
  const dir = scratchDir();
  setPhase(dir, 'danila', 'cut', '2026-01-05', '-0.5%/wk');
  const r = setPhase(dir, 'danila', 'cut', '2026-01-08', null);

  assert.equal(r.action, 'corrected');
  assert.equal(r.from, '2026-01-08');
  assert.equal(r.targetRate, '-0.5%/wk', 'the previously recorded rate must survive the correction, not reset to null');

  const path = join(dir, 'athletes', 'danila', 'phases.md');
  const { rows, warnings } = parsePhaseTable(readFileSync(path, 'utf8'));
  assert.equal(warnings.length, 0, warnings.join('; '));
  assert.equal(rows.length, 1, 'a correction must not close the row and insert a second one');
  assert.equal(rows[0].from, '2026-01-08');
  assert.equal(rows[0].to, null, 'the phase is still open');
  assert.equal(rows[0].targetRate, '-0.5%/wk');

  const current = currentPhase(dir, 'danila', '2026-01-29');
  assert.equal(current.weeks, 3, '"weeks running" must count from the corrected date, not reset by a fresh row');
});

test('setPhase refuses a --from in the future', () => {
  const dir = scratchDir();
  assert.throws(
    () => setPhase(dir, 'danila', 'cut', '2026-05-01', null, '2026-04-01'),
    (e) => e instanceof CoachError && /2026-05-01/.test(e.message) && /future/i.test(e.message),
  );
  assert.equal(existsSync(join(dir, 'athletes', 'danila', 'phases.md')), false);
});

test('setPhase preserves CRLF line endings when rewriting phases.md', () => {
  const dir = scratchDir();
  const path = join(dir, 'athletes', 'danila', 'phases.md');
  mkdirSync(dirname(path), { recursive: true });
  const crlf = [
    '| From | To | Phase | Target rate | Note |',
    '|---|---|---|---|---|',
    '| 2026-01-05 |  | cut | -0.5%/wk | wedding in December |',
  ].join('\r\n') + '\r\n';
  writeFileSync(path, crlf);

  setPhase(dir, 'danila', 'bulk', '2026-03-01', '+0.25%/wk');

  const text = readFileSync(path, 'utf8');
  assert.ok(text.includes('\r\n'), 'the file must still use CRLF');
  assert.ok(!/[^\r]\n/.test(text), 'no line may have been downgraded from CRLF to a bare LF');

  const { rows, warnings } = parsePhaseTable(text);
  assert.equal(warnings.length, 0, warnings.join('; '));
  assert.equal(rows.length, 2);
});

// --- phaseSet command (commands.mjs) -----------------------------------------

test('phaseSet defaults --from to today when none is given', () => {
  const dir = scratchDir();
  const r = phaseSet(dir, config, 'danila', 'cut', '2026-01-26', {});
  assert.equal(r.from, '2026-01-26');
});

test('phaseSet honours an explicit backdated --from', () => {
  const dir = scratchDir();
  const r = phaseSet(dir, config, 'danila', 'cut', '2026-01-26', { from: '2026-01-05' });
  assert.equal(r.from, '2026-01-05', 'the explicit backdated date wins over today');
});

test('formatPhaseSet reports a close-and-open, and a no-op, distinctly', () => {
  const opened = formatPhaseSet({
    action: 'opened',
    phase: 'bulk',
    from: '2026-03-01',
    targetRate: '+0.25%/wk',
    closedPrevious: { phase: 'cut', from: '2026-01-05', to: '2026-02-28' },
  });
  assert.match(opened, /closed cut/);
  assert.match(opened, /opened bulk/);

  const noop = formatPhaseSet({ action: 'noop', phase: 'cut', from: '2026-01-05' });
  assert.match(noop, /already on cut/);
  assert.match(noop, /nothing changed/);
});

// --- phase command + formatter --------------------------------------------

test('phase command reports the current open phase without --at', () => {
  const r = phase(DIR, config, 'danila', '2026-01-26', null);
  assert.equal(r.phase, 'cut');
  assert.equal(r.from, '2026-01-05');
  const text = formatPhase(r);
  assert.match(text, /cut/);
  assert.match(text, /2026-01-05/);
  assert.match(text, /-0\.5%\/wk/);
});

test('phase command with --at reports the phase covering that date', () => {
  const r = phase(DIR, config, 'danila', '2026-01-26', '2025-12-15');
  assert.equal(r.phase, 'bulk');
  const text = formatPhase(r);
  assert.match(text, /bulk/);
});

test('formatPhase names an unknown start plainly, without dates or weeks', () => {
  const text = formatPhase({ phase: 'maintain', from: null, weeks: null, targetRate: null, note: null, warnings: [] });
  assert.match(text, /maintain/);
  assert.doesNotMatch(text, /started/);
});

// --- brief clause -----------------------------------------------------------

test('brief adds a short phase clause for an athlete with a phases.md', () => {
  const r = brief(DIR, config, '2026-01-26');
  const text = formatBrief(r);
  const danilaLine = text.split('\n').find((l) => l.startsWith('danila:'));
  assert.match(danilaLine, /cut/);
});

test('brief adds no clause at all for an athlete without a phases.md', () => {
  const r = brief(DIR, config, '2026-01-26');
  const text = formatBrief(r);
  const veraLine = text.split('\n').find((l) => l.startsWith('vera:'));
  assert.doesNotMatch(veraLine, /maintain/);
  assert.doesNotMatch(veraLine, /unknown/);
});

// --- report carries the period's phase, not today's ------------------------

test('report over a period spanning a phase change reports both phases honestly, not just the one at the start', () => {
  // Today (2026-01-26) the athlete is on a "cut", but the report period
  // 2026-01-01..2026-01-26 starts while the earlier "bulk" was still open:
  // bulk covers 4 of the period's days (Jan 1-4), cut covers the other 22
  // (Jan 5-26). Reporting only the phase at the period's start (the bug)
  // would call the whole period "bulk" even though cut dominated it.
  const r = report(DIR, config, 'danila', '2026-01-01', '2026-01-26');
  assert.equal(r.phase.mixed, true);
  assert.equal(r.phase.phase, 'cut', 'cut covered 22 of 26 days and must be named as dominant');
  assert.equal(r.phase.segments.length, 2);

  const bulkSeg = r.phase.segments.find((s) => s.phase === 'bulk');
  const cutSeg = r.phase.segments.find((s) => s.phase === 'cut');
  assert.equal(bulkSeg.daysInPeriod, 4);
  assert.equal(cutSeg.daysInPeriod, 22);
  assert.equal(cutSeg.dominant, true);
  assert.equal(bulkSeg.dominant, false);

  const text = formatReport(r);
  assert.match(text, /bulk/);
  assert.match(text, /cut/);
  assert.match(text, /mixed/i);
});

test('report over a period that starts after the phase file\'s history reports the current open phase', () => {
  const r = report(DIR, config, 'danila', '2026-01-10', '2026-01-26');
  assert.equal(r.phase.phase, 'cut');
});

test('formatReport with no phase field does not crash and prints nothing about phases', () => {
  const r = { athlete: 'A', since: '2026-01-01', prs: [], mains: [], stalls: [], volume: [], tonnage: [], frequency: [], fatigueSignals: [], warnings: [] };
  const text = formatReport(r);
  assert.doesNotMatch(text, /Phase:/);
});

// `phase set --rate` accepts any text, so a target can be anything the
// athlete typed. Only these two shapes can be compared to a measured
// trend; everything else prints beside the fact with no verdict attached.
test('a percent-per-week target parses, in either spelling', () => {
  assert.deepEqual(parseTargetRate('-0.5%/wk'), { kind: 'pct', value: -0.5 });
  assert.deepEqual(parseTargetRate('+0.25 %/week'), { kind: 'pct', value: 0.25 });
  assert.deepEqual(parseTargetRate('0%/wk'), { kind: 'pct', value: 0 });
});

test('an absolute target parses and keeps its unit', () => {
  assert.deepEqual(parseTargetRate('-0.5 kg/wk'), { kind: 'abs', value: -0.5, units: 'kg' });
  assert.deepEqual(parseTargetRate('+1 lb/week'), { kind: 'abs', value: 1, units: 'lb' });
});

test('free text is not a target the code may act on', () => {
  assert.equal(parseTargetRate('полкило в неделю'), null);
  assert.equal(parseTargetRate('slowly'), null);
  assert.equal(parseTargetRate(''), null);
  assert.equal(parseTargetRate(null), null);
});

test('a Russian-spelled target parses the same way', () => {
  assert.deepEqual(parseTargetRate('-0.5%/нед'), { kind: 'pct', value: -0.5 });
  assert.deepEqual(parseTargetRate('-0,5 кг/неделю'), { kind: 'abs', value: -0.5, units: 'kg' });
});

// Code review, road to 1.0: the dominant phase of a period can be one that
// has since closed; its weeks are the weeks it ran, not the weeks since it
// began.
test('a dominant phase that already closed reports the weeks it ran', () => {
  const dir = scratchDir();
  writeFileSync(join(dir, '.coach.json'), JSON.stringify({ schema: 1, default_athlete: 'a', athletes: { a: { name: 'A' } } }));
  mkdirSync(join(dir, 'athletes', 'a'), { recursive: true });
  writeFileSync(join(dir, 'athletes', 'a', 'phases.md'), `| From | To | Phase | Target rate | Note |
|---|---|---|---|---|
| 2026-01-01 | 2026-06-30 | cut | -0.5%/wk | |
| 2026-07-01 |  | maintain |  | |
`);
  const r = report(dir, loadConfig(dir), 'a', '2026-02-01', '2026-09-23');
  assert.equal(r.phase.phase, 'cut');
  assert.equal(r.phase.weeks, 25);
});

test('a rate holding the table separator is refused before phases.md is written', () => {
  const dir = scratchDir();
  assert.throws(() => setPhase(dir, 'a', 'cut', '2026-09-01', '0.5 kg/wk | flexible', '2026-09-23'),
    (e) => e instanceof CoachError && /"\|"/.test(e.message));
  assert.equal(existsSync(join(dir, 'athletes', 'a', 'phases.md')), false);
});

// Found before 1.0: rates without a sign, units that don't
// match, periods a phase covers only in part, and writes over a table the
// parser cannot read.
test('a non-zero target rate without a sign is not read — cut or bulk, it has to say which', () => {
  assert.equal(parseTargetRate('0.5%/wk'), null);
  assert.equal(parseTargetRate('0.5 kg/wk'), null);
  assert.deepEqual(parseTargetRate('0%/wk'), { kind: 'pct', value: 0 });
});

test('phase set warns when its rate can never be compared with the measured trend', () => {
  const dir = scratchDir();
  writeFileSync(join(dir, '.coach.json'), JSON.stringify({ schema: 1, default_athlete: 'a', athletes: { a: { name: 'A' } } }));
  const r = phaseSet(dir, loadConfig(dir), 'a', 'cut', '2026-09-23', { rate: '0.5%/wk' });
  assert.ok(r.warnings.some((w) => /signed/.test(w)), JSON.stringify(r));
  assert.match(formatPhaseSet(r), /signed/);
});

function bwFolder({ units = 'kg', phases, weights }) {
  const dir = scratchDir();
  writeFileSync(join(dir, '.coach.json'), JSON.stringify({ schema: 1, units, default_athlete: 'a', athletes: { a: { name: 'A' } } }));
  mkdirSync(join(dir, 'athletes', 'a', 'log'), { recursive: true });
  writeFileSync(join(dir, 'athletes', 'a', 'phases.md'), `| From | To | Phase | Target rate | Note |\n|---|---|---|---|---|\n${phases}\n`);
  for (const [date, w] of weights) {
    writeFileSync(join(dir, 'athletes', 'a', 'log', `${date}.md`), `---\ndate: ${date}\nsession: A\nstatus: done\nbodyweight: ${w}\n---\n\n## Факт\n- Жим лёжа: 100x5\n`);
  }
  return dir;
}

test('a target in kg for an athlete logging pounds gets no verdict, and says why', () => {
  const dir = bwFolder({ units: 'lb', phases: '| 2026-08-01 |  | cut | -0.5 kg/wk | |', weights: [['2026-08-03', 200], ['2026-08-10', 199], ['2026-08-17', 198], ['2026-08-24', 197]] });
  const r = report(dir, loadConfig(dir), 'a', '2026-08-01', '2026-08-30');
  assert.equal(r.bodyweight.verdict, null);
  assert.ok(r.bodyweight.flags.some((f) => /kg/.test(f) && /lb/.test(f)), JSON.stringify(r.bodyweight.flags));
});

test('a period only partly covered by a phase is mixed, and weight is judged on the phase\'s own dates', () => {
  const dir = bwFolder({
    phases: '| 2026-09-06 |  | cut | -0.5%/wk | |',
    weights: [['2026-08-26', 85], ['2026-08-30', 85.4], ['2026-09-06', 85.2], ['2026-09-13', 84.8], ['2026-09-20', 84.4]],
  });
  const r = report(dir, loadConfig(dir), 'a', '2026-08-26', '2026-09-23');
  assert.equal(r.phase.mixed, true);
  assert.ok(r.phase.segments.some((s) => s.phase === 'unrecorded'), JSON.stringify(r.phase.segments));
  assert.equal(r.bodyweight.trend.from, '2026-09-06');
  assert.match(formatReport(r), /no phase recorded/);
});

test('phase set refuses to write over rows the parser cannot read', () => {
  const dir = scratchDir();
  mkdirSync(join(dir, 'athletes', 'a'), { recursive: true });
  writeFileSync(join(dir, 'athletes', 'a', 'phases.md'), '| From | To | Phase | Target rate | Note |\n|---|---|---|---|---|\n| 2026-07-01 |  | Cut | -0.5%/wk | |\n');
  assert.throws(() => setPhase(dir, 'a', 'maintain', '2026-09-01', null, '2026-09-23'), (e) => e instanceof CoachError && /cannot be read/.test(e.message));
});

test('correcting a start date into the previous phase is refused, not written as an overlap', () => {
  const dir = scratchDir();
  mkdirSync(join(dir, 'athletes', 'a'), { recursive: true });
  writeFileSync(join(dir, 'athletes', 'a', 'phases.md'), '| From | To | Phase | Target rate | Note |\n|---|---|---|---|---|\n| 2026-06-01 |  | cut | -0.5%/wk | |\n| 2026-01-01 | 2026-05-31 | bulk | +0.25%/wk | |\n');
  assert.throws(() => setPhase(dir, 'a', 'cut', '2026-05-15', null, '2026-09-23'), (e) => e instanceof CoachError && /overlap/.test(e.message));
});

test('a period with only skipped sessions still reports the skips', () => {
  const r = { athlete: 'A', since: '2026-01-01', sessions: 0, prs: [], mains: [], stalls: [], volume: [], tonnage: [], frequency: [], fatigueSignals: ['3 sessions skipped in the period'], warnings: [], cardio: { weeks: [], sameDay: [] } };
  assert.match(formatReport(r), /3 sessions skipped/);
});
