import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeName, parseExerciseTable, resolveExercise, addExerciseRow, addAliases } from '../scripts/lib/exercises.mjs';

const db = parseExerciseTable(readFileSync(new URL('./fixtures/gym/exercises.md', import.meta.url), 'utf8'));

test('normalizes case, spacing and yo', () => {
  assert.equal(normalizeName('  Жим  ЛЁЖА '), 'жим лежа');
});

test('parses every row', () => {
  assert.equal(db.list.length, 4);
});

test('reads the main flag', () => {
  assert.equal(resolveExercise('Жим лёжа', db).main, true);
  assert.equal(resolveExercise('Подтягивания', db).main, false);
});

test('reads muscles in order', () => {
  assert.deepEqual(resolveExercise('Присед', db).muscles, ['quads', 'glutes']);
});

test('resolves by canonical name', () => {
  assert.equal(resolveExercise('Жим лёжа', db).canonical, 'Жим лёжа');
});

test('resolves by alias', () => {
  assert.equal(resolveExercise('bench press', db).canonical, 'Жим лёжа');
});

test('resolves an alias written without yo', () => {
  assert.equal(resolveExercise('жим штанги лежа', db).canonical, 'Жим лёжа');
});

test('resolves a colloquial abbreviation', () => {
  assert.equal(resolveExercise('тяга гориз', db).canonical, 'Тяга горизонтального блока');
});

test('is case insensitive', () => {
  assert.equal(resolveExercise('SQUAT', db).canonical, 'Присед со штангой');
});

test('returns null for an unknown name', () => {
  assert.equal(resolveExercise('жим ногами', db), null);
});

// The index is first-come: a name two rows both claim resolves to whichever
// comes first, and the other row silently loses it. Nothing else would
// ever notice, so the shipped tables must hold no such name.
test('no name is claimed by two exercises in either shipped table', () => {
  for (const lang of ['ru', 'en']) {
    const text = readFileSync(new URL(`../templates/${lang}/exercises.md`, import.meta.url), 'utf8');
    const owners = new Map();
    for (const row of parseExerciseTable(text).list) {
      for (const name of [row.canonical, ...row.aliases]) {
        const key = normalizeName(name);
        if (!owners.has(key)) owners.set(key, new Set());
        owners.get(key).add(row.canonical);
      }
    }
    const shared = [...owners].filter(([, rows]) => rows.size > 1).map(([key, rows]) => `${key} → ${[...rows].join(' / ')}`);
    assert.deepEqual(shared, [], `templates/${lang}/exercises.md`);
  }
});

// A gap the implementation log recorded: the colloquial pause forms.
test('the colloquial names of the paused main lifts resolve', () => {
  const db = parseExerciseTable(readFileSync(new URL('../templates/ru/exercises.md', import.meta.url), 'utf8'));
  assert.equal(resolveExercise('паузная становая', db)?.canonical, 'Становая тяга с паузой');
  assert.equal(resolveExercise('паузный присед', db)?.canonical, 'Присед со штангой с паузой');
  assert.equal(resolveExercise('паузный жим', db)?.canonical, 'Жим штанги лёжа с паузой');
});

// /coach:exercise writes through these two, never by hand: the index is
// first-come for aliases but a canonical name always wins its key, so one
// careless row could take "становая" away from every deadlift ever logged.
const TABLE = `# Упражнения

| Exercise | Aliases | Equipment | Muscles | Main |
|---|---|---|---|---|
| Становая тяга (классическая) | становая; стан | barbell | hamstrings; glutes | yes |
| Жим гантелей лёжа | жим гантелей | dumbbell; bench | chest; triceps | no |
`;
const plinths = { name: 'Тяга с плинтов', aliases: ['тяга с блоков'], equipment: ['barbell'], muscles: ['hamstrings', 'glutes'], main: false };

test('a new exercise lands in its own section and resolves by name and alias', () => {
  const r = addExerciseRow(TABLE, plinths, 'ru');
  assert.equal(r.error, undefined);
  assert.match(r.text, /\n## Свои упражнения\n\n\| Exercise \| Aliases \| Equipment \| Muscles \| Main \|\n\|---\|---\|---\|---\|---\|\n\| Тяга с плинтов \| тяга с блоков \| barbell \| hamstrings; glutes \| no \|\n$/);
  const db = parseExerciseTable(r.text);
  assert.equal(resolveExercise('тяга с блоков', db).canonical, 'Тяга с плинтов');
  assert.equal(resolveExercise('стан', db).canonical, 'Становая тяга (классическая)');
});

test('a second new exercise joins the same section', () => {
  const once = addExerciseRow(TABLE, plinths, 'ru').text;
  const twice = addExerciseRow(once, { ...plinths, name: 'Жим гантелей на наклонной', aliases: [], muscles: ['chest', 'triceps'], equipment: ['dumbbell', 'bench'] }, 'ru');
  assert.equal(twice.error, undefined, twice.error);
  assert.equal(twice.text.match(/## Свои упражнения/g).length, 1);
  assert.match(twice.text, /\| Тяга с плинтов \|.*\n\| Жим гантелей на наклонной \|/);
});

test('a name another exercise already answers to is refused, naming that exercise', () => {
  const byName = addExerciseRow(TABLE, { ...plinths, name: 'Стан' }, 'ru');
  assert.match(byName.error, /"Стан".*Становая тяга \(классическая\)/);
  const byAlias = addExerciseRow(TABLE, { ...plinths, aliases: ['становая'] }, 'ru');
  assert.match(byAlias.error, /"становая".*Становая тяга \(классическая\)/);
});

test('muscles and equipment come from the table, plus any machine', () => {
  assert.match(addExerciseRow(TABLE, { ...plinths, muscles: ['бицепс'] }, 'ru').error, /unknown muscle "бицепс".*chest/);
  assert.match(addExerciseRow(TABLE, { ...plinths, equipment: ['гиря'] }, 'ru').error, /unknown equipment "гиря"/);
  assert.equal(addExerciseRow(TABLE, { ...plinths, equipment: ['machine:reverse-hyper'] }, 'ru').error, undefined);
});

test('a name holding a table delimiter is refused', () => {
  assert.match(addExerciseRow(TABLE, { ...plinths, name: 'Тяга | блоки' }, 'ru').error, /"\|"/);
  assert.match(addExerciseRow(TABLE, { ...plinths, aliases: ['a; b'] }, 'ru').error, /";"/);
});

test('an alias can be added to an existing exercise found by any of its names', () => {
  const r = addAliases(TABLE, 'стан', ['классика', 'тяга классика']);
  assert.equal(r.error, undefined);
  assert.equal(r.canonical, 'Становая тяга (классическая)');
  const db = parseExerciseTable(r.text);
  assert.equal(resolveExercise('тяга классика', db).canonical, 'Становая тяга (классическая)');
  assert.equal(resolveExercise('жим гантелей', db).canonical, 'Жим гантелей лёжа');
});

test('adding an alias refuses a taken name and an unknown exercise', () => {
  assert.match(addAliases(TABLE, 'стан', ['жим гантелей']).error, /"жим гантелей".*Жим гантелей лёжа/);
  assert.match(addAliases(TABLE, 'присед', ['x']).error, /no exercise answers to "присед"/);
  assert.match(addAliases(TABLE, 'стан', []).error, /at least one alias/);
});

// The shipped tables repeat each canonical name as its first alias, and
// log and import write new rows the same way; that is not a collision.
test('an alias that repeats the new name, or another alias, is not a collision', () => {
  const r = addExerciseRow(TABLE, { ...plinths, aliases: ['тяга с плинтов', 'тяга с блоков', 'Тяга с блоков'] }, 'ru');
  assert.equal(r.error, undefined, r.error);
  assert.match(r.text, /\| Тяга с плинтов \| тяга с плинтов; тяга с блоков \|/);
});

// Security review, road to 1.0: an exercise name travels back onto command
// lines (`stats.mjs exercises "<name>"`) every time it is logged. The
// table therefore never stores a character a shell acts on inside double
// quotes — so a name from it is always safe there. An apostrophe is fine:
// the shipped table has "Farmer's Carry".
test('a name a shell would act on inside double quotes is refused, an apostrophe is not', () => {
  for (const bad of ['Тяга $(rm -rf ~)', 'Жим `id`', 'Жим "узкий"', 'Жим\\узкий', 'Жим\nлёжа']) {
    assert.match(addExerciseRow(TABLE, { ...plinths, name: bad }, 'ru').error ?? '', /shell|control character/, bad);
    assert.match(addAliases(TABLE, 'стан', [bad]).error ?? '', /shell|control character/, bad);
  }
  assert.equal(addExerciseRow(TABLE, { ...plinths, name: "Farmer's March" }, 'ru').error, undefined);
});
