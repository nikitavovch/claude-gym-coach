// Set-line grammar for workout logs.
// A set is `load x reps [x count] [@rpe]`, where x may be Latin x/X, Cyrillic х/Х or *.
// Load is a number, or BW / BW+n / BW-n for bodyweight work.

const X = '[xXхХ*]';
const SET_RE = new RegExp(
  `^(\\d+(?:\\.\\d+)?|BW(?:[+-]\\d+(?:\\.\\d+)?)?)\\s*${X}\\s*(\\d+)(?:\\s*${X}\\s*(\\d+))?(?:\\s*@\\s*(\\d{1,2}(?:\\.5)?))?$`,
  'i'
);

const MAX_COUNT = 20;
const MAX_REPS = 100;
// A typo guard, not a physical limit, and deliberately unit-agnostic:
// 1000 is past any real set in either kilos or pounds.
const MAX_LOAD = 1000;

function buildSet(loadToken, reps, rpeToken) {
  const upper = loadToken.toUpperCase();
  let load = null;
  let bw = false;
  let bwOffset = 0;

  if (upper.startsWith('BW')) {
    bw = true;
    const rest = upper.slice(2);
    if (rest) bwOffset = Number(rest);
  } else {
    load = Number(loadToken);
  }

  const rpe = rpeToken === undefined ? null : Number(rpeToken);
  return { load, bw, bwOffset, reps, rpe };
}

function validRpe(rpe) {
  if (rpe === null) return true;
  return rpe >= 1 && rpe <= 10 && Math.round(rpe * 2) === rpe * 2;
}

export function parseSet(token) {
  const m = SET_RE.exec(token.trim());
  if (!m) return null;

  const reps = Number(m[2]);
  if (reps < 1 || reps > MAX_REPS) return null;

  const set = buildSet(m[1], reps, m[4]);
  if (!validRpe(set.rpe)) return null;
  if (set.load !== null && set.load > MAX_LOAD) return null;
  return set;
}

export function expandSet(token) {
  const m = SET_RE.exec(token.trim());
  if (!m) return { sets: [], error: `cannot parse set "${token.trim()}"` };

  const reps = Number(m[2]);
  if (reps < 1 || reps > MAX_REPS) {
    return { sets: [], error: `implausible rep count in "${token.trim()}"` };
  }

  const count = m[3] === undefined ? 1 : Number(m[3]);
  if (count < 1 || count > MAX_COUNT) {
    return { sets: [], error: `implausible set count in "${token.trim()}"` };
  }

  const set = buildSet(m[1], reps, m[4]);
  if (!validRpe(set.rpe)) return { sets: [], error: `RPE out of range in "${token.trim()}"` };
  if (set.load !== null && set.load > MAX_LOAD) {
    return { sets: [], error: `implausible load in "${token.trim()}"` };
  }

  const sets = [];
  for (let i = 0; i < count; i += 1) sets.push({ ...set });
  return { sets, error: null };
}

const NOTE_SEP = /\s+(?:—|--|–)\s+/;
const MISS_RE = /\((?:срыв|miss)\s*:\s*([^)]+)\)\s*$/i;

export function parseExerciseLine(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('- ')) return null;

  const body = trimmed.slice(2).trim();
  const colon = body.indexOf(':');
  if (colon === -1) return null;

  const name = body.slice(0, colon).trim();
  if (!name) return null;

  let rest = body.slice(colon + 1).trim();
  let note = null;

  const noteMatch = rest.split(NOTE_SEP);
  if (noteMatch.length > 1) {
    rest = noteMatch[0].trim();
    note = noteMatch.slice(1).join(' — ').trim();
  }

  let miss = null;
  const missMatch = MISS_RE.exec(rest);
  if (missMatch) {
    miss = missMatch[1].trim();
    rest = rest.slice(0, missMatch.index).trim();
  }

  const sets = [];
  const errors = [];
  for (const token of rest.split(',')) {
    const t = token.trim();
    if (!t) continue;
    const { sets: expanded, error } = expandSet(t);
    if (error) errors.push(error);
    else sets.push(...expanded);
  }

  return { name, sets, note, miss, errors };
}
