import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSet, expandSet, parseExerciseLine } from '../scripts/lib/parse-sets.mjs';

test('plain set', () => {
  assert.deepEqual(parseSet('80x5'), { load: 80, bw: false, bwOffset: 0, reps: 5, rpe: null });
});

test('set with RPE', () => {
  assert.deepEqual(parseSet('80x5 @7.5'), { load: 80, bw: false, bwOffset: 0, reps: 5, rpe: 7.5 });
});

test('fractional load', () => {
  assert.equal(parseSet('77.5x6').load, 77.5);
});

test('Cyrillic x is accepted', () => {
  assert.deepEqual(parseSet('80х5'), { load: 80, bw: false, bwOffset: 0, reps: 5, rpe: null });
});

test('asterisk separator is accepted', () => {
  assert.equal(parseSet('80*5').reps, 5);
});

test('bodyweight set', () => {
  assert.deepEqual(parseSet('BWx8'), { load: null, bw: true, bwOffset: 0, reps: 8, rpe: null });
});

test('weighted bodyweight set', () => {
  assert.deepEqual(parseSet('BW+10x8'), { load: null, bw: true, bwOffset: 10, reps: 8, rpe: null });
});

test('assisted bodyweight set', () => {
  assert.equal(parseSet('BW-20x8').bwOffset, -20);
});

test('rejects RPE out of range', () => {
  assert.equal(parseSet('80x5 @11'), null);
});

test('rejects RPE not on a half step', () => {
  assert.equal(parseSet('80x5 @7.3'), null);
});

test('rejects garbage', () => {
  assert.equal(parseSet('heavy single'), null);
});

test('expands a repeated set', () => {
  const { sets, error } = expandSet('80x5x3');
  assert.equal(error, null);
  assert.equal(sets.length, 3);
  assert.deepEqual(sets[0], { load: 80, bw: false, bwOffset: 0, reps: 5, rpe: null });
});

test('expansion keeps RPE on every set', () => {
  const { sets } = expandSet('70x8x2 @8');
  assert.equal(sets.length, 2);
  assert.equal(sets[1].rpe, 8);
});

test('rejects an absurd repeat count', () => {
  assert.match(expandSet('80x5x99').error, /count/i);
});

test('parses a full exercise line', () => {
  const r = parseExerciseLine('- Жим лёжа: 80x5 @7, 80x5 @7.5, 80x5 @8');
  assert.equal(r.name, 'Жим лёжа');
  assert.equal(r.sets.length, 3);
  assert.equal(r.sets[2].rpe, 8);
  assert.equal(r.note, null);
});

test('parses a note after an em dash', () => {
  const r = parseExerciseLine('- Тяга: 70x8x2, 70x7 — спина забилась');
  assert.equal(r.sets.length, 3);
  assert.equal(r.note, 'спина забилась');
});

test('parses a note after a double hyphen', () => {
  assert.equal(parseExerciseLine('- Row: 70x8 -- felt easy').note, 'felt easy');
});

test('parses a miss location', () => {
  const r = parseExerciseLine('- Присед: 100x3, 100x1 (срыв: низ)');
  assert.equal(r.sets.length, 2);
  assert.equal(r.miss, 'низ');
});

test('reports an unparsable set but keeps the good ones', () => {
  const r = parseExerciseLine('- Bench: 80x5, ???, 80x4');
  assert.equal(r.sets.length, 2);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /\?\?\?/);
});

test('returns null for a non-exercise line', () => {
  assert.equal(parseExerciseLine('just some text'), null);
});

test('whitespace around load/reps separator is allowed', () => {
  assert.deepEqual(parseSet('80 x 5'), { load: 80, bw: false, bwOffset: 0, reps: 5, rpe: null });
});

test('Cyrillic separator with spaces and RPE with space', () => {
  assert.deepEqual(parseSet('80 х 5 @ 7.5'), { load: 80, bw: false, bwOffset: 0, reps: 5, rpe: 7.5 });
});

test('exercise line with spaces around separators', () => {
  const r = parseExerciseLine('- Жим: 80 x 5, 80 x 5');
  assert.equal(r.sets.length, 2);
  assert.equal(r.sets[0].load, 80);
  assert.equal(r.sets[0].reps, 5);
});

test('rejects load exceeding maximum', () => {
  assert.equal(parseSet('10000x5'), null);
});

test('accepts load at ceiling', () => {
  assert.equal(parseSet('999x5').load, 999);
});
