import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseKnowledgeTable } from '../scripts/lib/exercises.mjs';

// A minimal but structurally real 11-column knowledge table, wrapped in the
// same "## 6." / "## 7." section markers the real parser looks for.
function wrap(row) {
  return '## 6. Exercise database\n'
    + '| Exercise EN | Exercise RU | Aliases EN | Aliases RU | Equipment | Pattern | Primary muscle | Secondary muscles | Main | Load type | Substitutes |\n'
    + '|---|---|---|---|---|---|---|---|---|---|---|\n'
    + row + '\n'
    + '\n## 7. Fractional volume credit\n';
}

test('a well-formed row parses into the expected fields', () => {
  const row = '| Foo | Фу | alias en | alias ru | barbell | squat | quads | glutes | yes | external | Bar |';
  const rows = parseKnowledgeTable(wrap(row));
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    exerciseEn: 'Foo',
    exerciseRu: 'Фу',
    aliasesEn: ['alias en'],
    aliasesRu: ['alias ru'],
    equipment: ['barbell'],
    pattern: 'squat',
    primaryMuscle: 'quads',
    secondaryMuscles: ['glutes'],
    main: true,
    loadType: 'external',
    substitutes: ['Bar'],
  });
});

test('an unescaped "|" inside a cell fails loudly instead of silently shifting later columns', () => {
  // The extra "|" inside the aliases cell adds a 12th column, which would
  // otherwise shift "quads" (meant as the primary muscle) one column to the
  // right with no warning.
  const row = '| Foo | Фу | alias | one | two | barbell | squat | quads | glutes | yes | external | Bar |';
  assert.throws(
    () => parseKnowledgeTable(wrap(row)),
    (e) => e instanceof Error && /expected 11 columns, got 12/.test(e.message) && e.message.includes(row),
  );
});

test('a row missing a column fails loudly instead of being silently dropped', () => {
  const row = '| Foo | Фу | alias | alias | barbell | squat | quads | yes | external | Bar |'; // 10 cells
  assert.throws(
    () => parseKnowledgeTable(wrap(row)),
    (e) => e instanceof Error && /expected 11 columns, got 10/.test(e.message),
  );
});

test('an empty primary-muscle cell fails loudly even when secondary muscles are present', () => {
  // muscles.length > 0 downstream would stay true here (secondary muscles
  // exist), so only an explicit check on the primary-muscle cell itself
  // catches this.
  const row = '| Foo | Фу | alias | alias | barbell | squat |  | quads, glutes | yes | external | Bar |';
  assert.throws(
    () => parseKnowledgeTable(wrap(row)),
    (e) => e instanceof Error && /empty primary-muscle cell/.test(e.message),
  );
});

test('the real knowledge/exercises.md still parses cleanly (no malformed rows)', () => {
  const text = readFileSync(new URL('../knowledge/exercises.md', import.meta.url), 'utf8');
  const rows = parseKnowledgeTable(text);
  assert.ok(rows.length > 100, `expected the full table, got ${rows.length}`);
  for (const row of rows) assert.ok(row.primaryMuscle, `${row.exerciseEn} has no primary muscle`);
});
