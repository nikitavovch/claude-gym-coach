import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseExerciseTable, resolveExercise } from '../scripts/lib/exercises.mjs';

for (const lang of ['ru', 'en']) {
  test(`${lang} exercise template parses`, () => {
    const db = parseExerciseTable(readFileSync(new URL(`../templates/${lang}/exercises.md`, import.meta.url), 'utf8'));
    assert.ok(db.list.length > 100, `expected the full table, got ${db.list.length}`);
    assert.ok(db.list.some((e) => e.main), 'expected at least one main lift');
  });
}

test('ru template resolves Russian and English names for the squat', () => {
  const db = parseExerciseTable(readFileSync(new URL('../templates/ru/exercises.md', import.meta.url), 'utf8'));
  assert.ok(resolveExercise('присед', db));
  assert.ok(resolveExercise('back squat', db));
});

test('every exercise has a primary muscle', () => {
  const db = parseExerciseTable(readFileSync(new URL('../templates/ru/exercises.md', import.meta.url), 'utf8'));
  for (const e of db.list) assert.ok(e.muscles.length > 0, `${e.canonical} has no muscles`);
});
