import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLogFile } from '../scripts/lib/parse-log.mjs';

const FULL = `---
date: 2026-09-20
session: Upper A
status: done
duration_min: 70
time: 18:30
feel: 4
bodyweight: 84.5
---

## План
- Жим лёжа: 3x5 @80 (RPE 7-8)

## Факт
- Жим лёжа: 80x5 @7, 80x5 @8
- Подтягивания: BWx8

## Кардио
- Бег 40мин @6, 6.5км, 07:30 — лёгкий темп

## Заметки
Спал 6 часов.
`;

test('reads frontmatter', () => {
  const d = parseLogFile(FULL, '2026-09-20.md');
  assert.equal(d.date, '2026-09-20');
  assert.equal(d.session, 'Upper A');
  assert.equal(d.status, 'done');
  assert.equal(d.durationMin, 70);
  assert.equal(d.time, '18:30');
  assert.equal(d.feel, 4);
  assert.equal(d.bodyweight, 84.5);
});

test('reads the actual section only', () => {
  const d = parseLogFile(FULL, '2026-09-20.md');
  assert.equal(d.actual.length, 2);
  assert.equal(d.actual[0].name, 'Жим лёжа');
  assert.equal(d.actual[0].sets.length, 2);
  assert.equal(d.plan.length, 1);
});

test('reads cardio', () => {
  const d = parseLogFile(FULL, '2026-09-20.md');
  assert.equal(d.cardio.length, 1);
  assert.equal(d.cardio[0].modality, 'Бег');
  assert.equal(d.cardio[0].minutes, 40);
  assert.equal(d.cardio[0].rpe, 6);
  assert.equal(d.cardio[0].distance, '6.5км');
  assert.equal(d.cardio[0].time, '07:30');
});

test('reads notes', () => {
  assert.match(parseLogFile(FULL, '2026-09-20.md').notes, /Спал 6 часов/);
});

test('accepts English headings', () => {
  const text = `---
date: 2026-09-20
session: Upper A
status: done
---

## Actual
- Bench Press: 80x5

## Notes
fine
`;
  const d = parseLogFile(text, '2026-09-20.md');
  assert.equal(d.actual.length, 1);
  assert.equal(d.notes, 'fine');
});

test('errors when the filename and date disagree', () => {
  const d = parseLogFile(FULL, '2026-09-21.md');
  assert.ok(d.errors.some((e) => /filename/i.test(e)));
});

test('errors on a missing required key', () => {
  const d = parseLogFile('---\ndate: 2026-09-20\n---\n\n## Факт\n- Bench: 80x5\n', '2026-09-20.md');
  assert.ok(d.errors.some((e) => /session/i.test(e)));
  assert.ok(d.errors.some((e) => /status/i.test(e)));
});

test('errors on an unknown status', () => {
  const text = FULL.replace('status: done', 'status: maybe');
  assert.ok(parseLogFile(text, '2026-09-20.md').errors.some((e) => /status/i.test(e)));
});

test('errors when a done day has no actual section', () => {
  const text = `---
date: 2026-09-20
session: Upper A
status: done
---

## План
- Bench: 3x5 @80
`;
  assert.ok(parseLogFile(text, '2026-09-20.md').errors.some((e) => /actual/i.test(e)));
});

test('a planned day needs no actual section', () => {
  const text = `---
date: 2026-09-20
session: Upper A
status: planned
---

## План
- Bench: 3x5 @80
`;
  assert.deepEqual(parseLogFile(text, '2026-09-20.md').errors, []);
});

test('warns on a feel outside 1..5', () => {
  const text = FULL.replace('feel: 4', 'feel: 9');
  assert.ok(parseLogFile(text, '2026-09-20.md').warnings.some((w) => /feel/i.test(w)));
});

test('errors when frontmatter is missing entirely', () => {
  assert.ok(parseLogFile('## Факт\n- Bench: 80x5\n', '2026-09-20.md').errors.some((e) => /frontmatter/i.test(e)));
});

test('surfaces a broken set line as an error with its line number', () => {
  const text = FULL.replace('- Подтягивания: BWx8', '- Подтягивания: ???');
  const d = parseLogFile(text, '2026-09-20.md');
  assert.ok(d.errors.some((e) => /\?\?\?/.test(e)));
});

test('parses minimal cardio with only modality and minutes', () => {
  const text = `---
date: 2026-09-20
session: Upper A
status: done
---

## Кардио
- Бег 40мин
`;
  const d = parseLogFile(text, '2026-09-20.md');
  assert.equal(d.cardio.length, 1);
  assert.equal(d.cardio[0].modality, 'Бег');
  assert.equal(d.cardio[0].minutes, 40);
  assert.equal(d.cardio[0].rpe, null);
  assert.equal(d.cardio[0].distance, null);
});

test('parses cardio with distance but no RPE', () => {
  const text = `---
date: 2026-09-20
session: Upper A
status: done
---

## Кардио
- Бег 40мин, 6.5км
`;
  const d = parseLogFile(text, '2026-09-20.md');
  assert.equal(d.cardio.length, 1);
  assert.equal(d.cardio[0].modality, 'Бег');
  assert.equal(d.cardio[0].minutes, 40);
  assert.equal(d.cardio[0].rpe, null);
  assert.equal(d.cardio[0].distance, '6.5км');
});

test('parses cardio with note but no RPE or distance', () => {
  const text = `---
date: 2026-09-20
session: Upper A
status: done
---

## Кардио
- Бег 40мин — лёгкий
`;
  const d = parseLogFile(text, '2026-09-20.md');
  assert.equal(d.cardio.length, 1);
  assert.equal(d.cardio[0].modality, 'Бег');
  assert.equal(d.cardio[0].minutes, 40);
  assert.equal(d.cardio[0].note, 'лёгкий');
});

test('parses English cardio with only modality and minutes', () => {
  const text = `---
date: 2026-09-20
session: Upper A
status: done
---

## Cardio
- Running 30min
`;
  const d = parseLogFile(text, '2026-09-20.md');
  assert.equal(d.cardio.length, 1);
  assert.equal(d.cardio[0].modality, 'Running');
  assert.equal(d.cardio[0].minutes, 30);
});

test('errors on genuinely malformed cardio line', () => {
  const text = `---
date: 2026-09-20
session: Upper A
status: done
---

## Кардио
- Бег быстро
`;
  const d = parseLogFile(text, '2026-09-20.md');
  assert.ok(d.errors.some((e) => /быстро/.test(e)));
});

test('errors when actual section line lacks colon', () => {
  const text = `---
date: 2026-09-20
session: Upper A
status: done
---

## Факт
- Bench: 80x5
- Squat 100x5
- Row: 60x8
`;
  const d = parseLogFile(text, '2026-09-20.md');
  assert.equal(d.actual.length, 2);
  assert.equal(d.actual[0].name, 'Bench');
  assert.equal(d.actual[1].name, 'Row');
  assert.ok(d.errors.some((e) => /Squat/.test(e)));
  assert.ok(d.errors.some((e) => /line/.test(e)));
});

test('parses frontmatter with trailing whitespace on closing delimiter', () => {
  const text = `---
date: 2026-09-20
session: Upper A
status: done
---

## Факт
- Bench: 80x5
`;
  const d = parseLogFile(text, '2026-09-20.md');
  assert.equal(d.date, '2026-09-20');
  assert.equal(d.session, 'Upper A');
  assert.equal(d.status, 'done');
  assert.deepEqual(d.errors, []);
});

test('ignores prose lines in actual section without dash', () => {
  const text = `---
date: 2026-09-20
session: Upper A
status: done
---

## Факт
- Bench: 80x5
Some prose here
- Row: 60x8
`;
  const d = parseLogFile(text, '2026-09-20.md');
  assert.equal(d.actual.length, 2);
  assert.equal(d.actual[0].name, 'Bench');
  assert.equal(d.actual[1].name, 'Row');
  assert.deepEqual(d.errors, []);
});

// `time` is optional, but when present it is the one frontmatter field a
// dictation can mangle into prose ("6pm", "вечером"). A warning, not an
// error: a malformed time must not cost the athlete the session's sets.
test('warns on a time that is not HH:MM', () => {
  const text = FULL.replace('time: 18:30', 'time: 6pm');
  const d = parseLogFile(text, '2026-09-20.md');
  assert.ok(d.warnings.some((w) => /time/i.test(w)));
  assert.deepEqual(d.errors, []);
});

test('warns on a time with an impossible hour', () => {
  const text = FULL.replace('time: 18:30', 'time: 25:30');
  assert.ok(parseLogFile(text, '2026-09-20.md').warnings.some((w) => /time/i.test(w)));
});

test('a valid HH:MM time warns about nothing', () => {
  const d = parseLogFile(FULL, '2026-09-20.md');
  assert.equal(d.warnings.filter((w) => /time/i.test(w)).length, 0);
});

test('a cardio start time with no distance is a time, not a distance', () => {
  const text = '---\ndate: 2026-03-02\nsession: A\nstatus: done\n---\n## Факт\n- Жим лёжа: 100x5\n## Кардио\n- Гребля 20мин @8, 17:00 — интервалы\n';
  const [c] = parseLogFile(text, '2026-03-02.md').cardio;
  assert.equal(c.distance, null);
  assert.equal(c.time, '17:00');
  assert.equal(c.note, 'интервалы');
});

// A day with only cardio on it — a run on a rest day — is a closed session
// too; before, `done` demanded exercise lines and such a day could not be
// logged at all.
test('a done day with only cardio parses clean', () => {
  const text = '---\ndate: 2026-03-03\nsession: Кардио\nstatus: done\n---\n\n## Кардио\n- Бег 45мин Z2, 8км, 07:00\n';
  const d = parseLogFile(text, '2026-03-03.md');
  assert.deepEqual(d.errors, []);
  assert.equal(d.actual.length, 0);
  assert.equal(d.cardio.length, 1);
});

test('a done day with neither exercises nor cardio is still an error', () => {
  const text = '---\ndate: 2026-03-03\nsession: A\nstatus: done\n---\n\n## Заметки\nничего\n';
  const d = parseLogFile(text, '2026-03-03.md');
  assert.ok(d.errors.some((e) => /neither the actual nor the cardio section/.test(e)), d.errors.join('; '));
});

// Found before 1.0, in a hunt for silent failures: numbers in the
// frontmatter and lines the parser never looked at.
const day = (fm, body = '## Факт\n- Жим лёжа: 100x5\n') => `---\ndate: 2026-03-03\nsession: A\nstatus: done\n${fm}---\n\n${body}`;

test('a decimal comma in bodyweight is read, the way a Russian athlete writes it', () => {
  const d = parseLogFile(day('bodyweight: 83,1\n'), '2026-03-03.md');
  assert.equal(d.bodyweight, 83.1);
  assert.deepEqual(d.warnings, []);
});

test('an unreadable or blank number is null with a warning, never NaN or zero', () => {
  for (const [line, key] of [['bodyweight: 83.1 kg\n', 'bodyweight'], ['bodyweight:\n', 'bodyweight'], ['feel:\n', 'feel'], ['feel: 7\n', 'feel'], ['duration_min: час\n', 'duration_min']]) {
    const d = parseLogFile(day(line), '2026-03-03.md');
    const field = { bodyweight: d.bodyweight, feel: d.feel, duration_min: d.durationMin }[key];
    assert.equal(field, null, line);
    assert.ok(d.warnings.some((w) => w.includes(key)), `${line}: ${d.warnings.join('; ')}`);
  }
});

test('an unknown section heading is reported, not silently dropped', () => {
  const d = parseLogFile(day('', '## Actual:\n- Жим лёжа: 100x5\n\n## Кардио\n- Бег 20мин Z2\n'), '2026-03-03.md');
  assert.ok(d.warnings.some((w) => /## Actual:/.test(w)), d.warnings.join('; '));
});

test('a line in Actual that is not a "- " item is reported, not silently dropped', () => {
  const d = parseLogFile(day('', '## Факт\n- Жим лёжа: 100x5\n* Присед: 120x5\n1. Тяга: 140x3\n<!-- comment -->\n\n'), '2026-03-03.md');
  assert.equal(d.warnings.filter((w) => /not a "- " item/.test(w)).length, 2, d.warnings.join('; '));
});
