import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGymLoads, nearestBarbell, nearestDumbbell, warmupLadder } from '../scripts/lib/gym.mjs';

// The load on the bar is the number the athlete acts on at the gym; it is
// computed here, from the gym's own plates, never rounded in a prompt.
const GYM = `# Зал

## Грифы
- гриф: 20

## Блины и минимальный шаг
- блины: 25, 20, 15, 10, 5, 2,5, 1.25

## Гантели
- гантели: 2–40 шаг 2
`;

test('the machine-readable lines of gym.md are read, in Russian or English, with decimal commas', () => {
  assert.deepEqual(parseGymLoads(GYM), { bar: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25], dumbbells: { min: 2, max: 40, step: 2 } });
  assert.deepEqual(parseGymLoads('- bar: 45\n- plates: 45, 35, 25, 10, 5, 2.5\n'), { bar: 45, plates: [45, 35, 25, 10, 5, 2.5], dumbbells: null });
  assert.deepEqual(parseGymLoads('# Gym\nJust some prose about the gym.\n'), { bar: null, plates: [], dumbbells: null });
});

test('a barbell load rounds to the nearest buildable weight, down on a tie, with plates per side', () => {
  const g = parseGymLoads(GYM);
  assert.deepEqual(nearestBarbell(103, g), { load: 102.5, perSide: [25, 15, 1.25] });
  assert.deepEqual(nearestBarbell(103.75, g), { load: 102.5, perSide: [25, 15, 1.25] }, 'a tie rounds down');
  assert.deepEqual(nearestBarbell(20, g), { load: 20, perSide: [] });
  assert.deepEqual(nearestBarbell(12, g), { load: 20, perSide: [] }, 'nothing lighter than the bar');
});

test('a dumbbell load rounds to the rack step, down on a tie, within its range', () => {
  const g = parseGymLoads(GYM);
  assert.equal(nearestDumbbell(23, g), 22);
  assert.equal(nearestDumbbell(23.5, g), 24);
  assert.equal(nearestDumbbell(55, g), 40);
});

test('a warm-up ramps through the knowledge base percentages, each step buildable', () => {
  const g = parseGymLoads(GYM);
  assert.deepEqual(warmupLadder(105, g).map((s) => [s.load, s.reps]), [[20, '8–10'], [42.5, '5'], [57.5, '3'], [72.5, '2'], [85, '1–2'], [97.5, '1']]);
});

test('a light working weight gets a short ramp, never a step at or above it', () => {
  const g = parseGymLoads(GYM);
  const ladder = warmupLadder(40, g);
  assert.ok(ladder.every((s) => s.load < 40), JSON.stringify(ladder));
  assert.equal(new Set(ladder.map((s) => s.load)).size, ladder.length, 'no step repeats');
});

// The templates carry placeholders, never plausible numbers: a template
// value left unreplaced must read as "not recorded", not as a real bar.
test('the gym templates hold placeholders the parser reads as nothing', async () => {
  const { readFileSync } = await import('node:fs');
  for (const lang of ['en', 'ru']) {
    const g = parseGymLoads(readFileSync(new URL(`../templates/${lang}/gym.md`, import.meta.url), 'utf8'));
    assert.deepEqual(g, { bar: null, plates: [], dumbbells: null }, lang);
  }
});
