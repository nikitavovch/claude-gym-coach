import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, join } from 'node:path';
import { loadAthlete, loadDb, CoachError, currentPhase, phaseAt, phaseRange, setPhase, assertRealDate, parseTargetRate, profileFreshness } from './data.mjs';
import { parseLogFile } from './parse-log.mjs';
import { parseGymLoads, nearestBarbell, nearestDumbbell, warmupLadder } from './gym.mjs';
import { resolveExercise, parseKnowledgeTable, addExerciseRow, addAliases, normalizeName } from './exercises.mjs';
import { setE1rm, performanceE1rm, smoothedE1rm, bestLoad, bestAddedLoad, rpeTrustworthy, detectStall, trend, isoWeek, bodyweightTrend, rateVerdict, cardioIntensity, repRecords } from './calc.mjs';

// A closed session with exercise lines in it. A done day with only cardio
// is still a session, but not a lifting one.
function isLifting(day) {
  return day.status === 'done' && day.actual.length > 0;
}

function daysBetween(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

export function brief(dir, config, today) {
  const athletes = [];

  for (const id of Object.keys(config.athletes)) {
    const a = loadAthlete(dir, id, config);
    // Lifting sessions only: plan picks the next session in the rotation
    // after this one, and a run on a rest day is not in the rotation.
    const done = a.days.filter(isLifting);
    const last = done.at(-1) ?? null;
    const todayFile = a.days.find((d) => d.date === today) ?? null;
    const openPlanned = a.days
      .filter((d) => d.status === 'planned' && d.date < today)
      .map((d) => d.date);

    // An athlete with no phases.md gets no clause at all (a missing
    // file means "maintain, unknown start", which is not worth a line every
    // brief) — only currentPhase().hasFile gates whether `phase` is set.
    const phaseInfo = currentPhase(dir, id, today);

    athletes.push({
      id,
      name: a.name,
      last: last?.date ?? null,
      lastSession: last?.session ?? null,
      daysAgo: last ? daysBetween(last.date, today) : null,
      total: done.length,
      todayStatus: todayFile?.status ?? null,
      todaySession: todayFile?.session ?? null,
      openPlanned,
      phase: phaseInfo.hasFile ? { phase: phaseInfo.phase, weeks: phaseInfo.weeks } : null,
      warnings: [...a.warnings, ...phaseInfo.warnings],
    });
  }

  return { today, athletes };
}

export function recent(dir, config, id, n = 5) {
  if (!Number.isInteger(n) || n < 1) {
    throw new CoachError(`recent count must be a positive integer, got ${n}`);
  }

  const a = loadAthlete(dir, id, config);
  const rows = a.days
    .slice()
    .reverse()
    .slice(0, n)
    .map((d) => ({
      date: d.date,
      session: d.session,
      status: d.status,
      cardioOnly: d.status === 'done' && d.actual.length === 0 && d.cardio.length > 0,
    }));
  return { athlete: a.name, rows, warnings: a.warnings };
}

// `at` is the optional --at YYYY-MM-DD; when absent, `today` is used for
// both the reference date and the "weeks running" duration.
export function phase(dir, config, id, today, at = null) {
  if (at) assertRealDate(at, '--at');
  const athlete = loadAthlete(dir, id, config);
  const result = at ? phaseAt(dir, id, at) : currentPhase(dir, id, today);

  // Only the phase running today gets a bodyweight verdict, and only from
  // the day it opened: the question this command answers is "am I on
  // track", which is about the phase in progress.
  const bw = at || !result.from
    ? null
    : bodyweightOver(athlete, result.from, today, result.targetRate);

  return { athlete: athlete.name, units: athlete.units, ...result, bodyweight: bw };
}

// The exercise catalogue, projected.
//
// A program specialist reads knowledge/exercises.md whole — 9958 words — to
// pick exercises, and two thirds of that it cannot use: the alias columns
// exist so `log` and `import` can resolve dictation, and a specialist
// picking from a list resolves nothing. This hands it the same rows with
// only the columns a picker needs, optionally narrowed to what the gym can
// actually do. The file stays the single source of truth; only the
// delivery changes.
const KNOWLEDGE_TABLE = fileURLToPath(new URL('../../knowledge/exercises.md', import.meta.url));

// knowledge/exercises.md §3.1 marks `bench` and `rack` as accessories,
// "combined with barbell/dumbbell/bodyweight"; every other entry in an
// Equipment cell is an alternative. So an exercise is possible when the gym
// has at least one of its primary options AND all of its accessories —
// matching on any overlap would offer a barbell box squat to a gym whose
// only qualifying item is the bench.
const ACCESSORY_EQUIPMENT = new Set(['bench', 'rack']);

function gymCanDo(equipment, wanted) {
  // "machine:ghd" belongs to whoever has machines of that family.
  const has = (item) => wanted.has(item.split(':')[0].toLowerCase()) || wanted.has(item.toLowerCase());
  const primary = equipment.filter((e) => !ACCESSORY_EQUIPMENT.has(e.toLowerCase()));
  const accessories = equipment.filter((e) => ACCESSORY_EQUIPMENT.has(e.toLowerCase()));

  if (primary.length && !primary.some(has)) return false;
  return accessories.every(has);
}

export function catalog({ equipment = null, main = false, lang = 'en' } = {}) {
  const rows = parseKnowledgeTable(readFileSync(KNOWLEDGE_TABLE, 'utf8'));
  const wanted = equipment?.length ? new Set(equipment.map((e) => e.trim().toLowerCase())) : null;

  // A tag the table never uses — "dumbbells", "machine:leg press" — used to
  // match nothing and quietly strip that equipment's exercises out of a
  // programme. Every tag must be one the table uses, or a machine family.
  if (wanted) {
    const known = new Set(rows.flatMap((r) => r.equipment.flatMap((e) => [e.toLowerCase(), e.toLowerCase().split(':')[0]])));
    for (const tag of wanted) {
      if (!known.has(tag)) {
        throw new CoachError(`unknown equipment "${tag}" — the catalogue uses: ${[...known].sort().join(', ')}`);
      }
    }
  }

  const kept = rows
    .filter((r) => !main || r.main)
    .filter((r) => !wanted || gymCanDo(r.equipment, wanted));

  // Substitutes are stored as canonical English names. Two corrections
  // before they leave: drop the ones this gym cannot build — a substitute
  // the athlete has no equipment for is worse than none — and name them in
  // the catalogue's own language, since the specialist writes program.md
  // in it and would otherwise put English names into a Russian programme.
  const available = new Set(kept.map((r) => r.exerciseEn));
  const ruByEn = new Map(rows.map((r) => [r.exerciseEn, r.exerciseRu]));
  const rename = (en) => (lang === 'ru' ? ruByEn.get(en) ?? en : en);

  const exercises = kept.map((r) => ({
    name: lang === 'ru' ? r.exerciseRu : r.exerciseEn,
    equipment: r.equipment,
    pattern: r.pattern,
    primaryMuscle: r.primaryMuscle,
    secondaryMuscles: r.secondaryMuscles,
    main: r.main,
    substitutes: r.substitutes.filter((sub) => available.has(sub)).map(rename),
  }));

  return { lang, filteredBy: { equipment: equipment ?? null, main }, total: rows.length, exercises };
}

// Bodyweight over a period, against the phase's target
// (the bodyweight design). The phase is the one running today,
// because the question this answers is "am I on track", which is about the
// phase the athlete is in — `report` is where a past period gets analysed.
const FAST_LOSS_PCT_PER_WEEK = -1;

function bodyweightOver(athlete, from, to, targetRate) {
  const inWindow = athlete.days.filter((d) => d.date >= from && d.date <= to);
  const result = bodyweightTrend(inWindow);
  let target = parseTargetRate(targetRate);

  const flags = [];
  // A target in kg against a log in pounds (or the other way) compares two
  // different numbers; no conversion is guessed, and no verdict given.
  if (target?.kind === 'abs' && target.units !== athlete.units) {
    flags.push(`the target is in ${target.units}/wk and the log in ${athlete.units} — no verdict`);
    target = null;
  }
  // The same threshold, and the same reasoning, as agents/analyst.md's
  // rate-of-loss flag [sourced: Helms 2014, ISSN 2017 position stand].
  // No symmetric flag for gaining: no source states one.
  if (result.enough && result.pctPerWeek <= FAST_LOSS_PCT_PER_WEEK) {
    flags.push(`losing faster than 1%/wk (${result.pctPerWeek.toFixed(2)}%/wk)`);
  }

  return { trend: result, parsedTarget: target, verdict: rateVerdict(result, target), flags };
}

export function bodyweight(dir, config, id, since, today) {
  const athlete = loadAthlete(dir, id, config);
  const from = parseSince(since, today);
  const phaseNow = currentPhase(dir, id, today);
  const bw = bodyweightOver(athlete, from, today, phaseNow.targetRate);

  return {
    athlete: athlete.name,
    units: athlete.units,
    since: from,
    trend: bw.trend,
    phase: {
      phase: phaseNow.phase,
      from: phaseNow.from,
      targetRate: phaseNow.targetRate,
      parsedTarget: bw.parsedTarget,
    },
    verdict: bw.verdict,
    flags: bw.flags,
    warnings: [...athlete.warnings, ...(phaseNow.warnings ?? [])],
  };
}

// `phase set` — closes the open phase (if any) and opens a new one.
// `from` defaults to `today` when not given, matching the CLI's own
// default-to-today convention for every other date argument.
export function phaseSet(dir, config, id, phaseName, today, { from = null, rate = null } = {}) {
  const athlete = loadAthlete(dir, id, config);
  const result = setPhase(dir, id, phaseName, from ?? today, rate, today);
  const warnings = rate && !parseTargetRate(rate)
    ? [`target rate "${rate}" can never be compared with the measured trend — write it signed, like -0.5%/wk or +0.25 kg/wk`]
    : [];
  return { athlete: athlete.name, ...result, warnings };
}

export function validate(paths, db = null) {
  const files = [];

  for (const path of paths) {
    let text;
    try {
      text = readFileSync(path, 'utf8');
    } catch (e) {
      files.push({ path, ok: false, errors: [`cannot read file: ${e.message}`], warnings: [], exercises: 0, sets: 0, cardio: 0 });
      continue;
    }

    const day = parseLogFile(text, basename(path));
    const sets = day.actual.reduce((sum, e) => sum + e.sets.length, 0);
    const warnings = [...day.warnings];

    if (db) {
      for (const exercise of day.actual) {
        const resolved = resolveExercise(exercise.name, db);
        if (!resolved) {
          warnings.push(`unknown exercise "${exercise.name}"`);
        } else if (resolved.main && exercise.sets.some((s) => s.rpe === null)) {
          warnings.push(`no RPE on main lift "${exercise.name}"`);
        }
      }
    }

    files.push({
      path,
      ok: day.errors.length === 0,
      errors: day.errors,
      warnings,
      exercises: day.actual.length,
      sets,
      cardio: day.cardio.length,
    });
  }

  return { files };
}

function setToText(s) {
  const load = s.bw ? `BW${s.bwOffset > 0 ? `+${s.bwOffset}` : s.bwOffset < 0 ? s.bwOffset : ''}` : s.load;
  return `${load}x${s.reps}${s.rpe !== null ? ` @${s.rpe}` : ''}`;
}

// The name an exercise is grouped under: the table's canonical name when it
// knows the exercise, otherwise the first spelling logged, folded the way
// the table folds names — "Жим Ларсена" and "жим ларсена" are one exercise
// even before anyone adds it. One keyer per command, so every block of one
// report agrees on the label.
function exerciseKeyer(db) {
  const firstSpelling = new Map();
  const unknown = new Set();
  const keyOf = (name) => {
    const resolved = resolveExercise(name, db);
    if (resolved) return resolved.canonical;
    const folded = normalizeName(name);
    if (!firstSpelling.has(folded)) firstSpelling.set(folded, name);
    unknown.add(firstSpelling.get(folded));
    return firstSpelling.get(folded);
  };
  keyOf.unknown = unknown;
  return keyOf;
}

function tableWarnings(db) {
  return db.missing ? ['no exercises.md in this folder — every exercise reads as unknown; restore it or run /coach:init'] : [];
}

function entriesFor(athlete, canonical, db) {
  const out = [];
  for (const day of athlete.days) {
    if (day.status !== 'done') continue;
    for (const entry of day.actual) {
      const resolved = resolveExercise(entry.name, db);
      const key = resolved ? resolved.canonical : normalizeName(entry.name);
      if (key !== canonical) continue;
      out.push({ date: day.date, sets: entry.sets, note: entry.note, miss: entry.miss });
    }
  }
  return out;
}

// What log announces after a session, decided here: a record is strictly
// better than every earlier performance — matching one is not, and a
// first-ever performance has nothing to beat — measured against the
// performance's own date, not the day the command runs. The load change
// against the previous performance is how a misheard "eighteen" for
// "eighty" gets caught before it becomes history.
function latestPerformance(history) {
  const last = history.at(-1);
  if (!last) return null;
  const earlier = history.slice(0, -1);
  const top = (h) => bestLoad(h.sets) ?? bestAddedLoad(h.sets);
  const maxOf = (values) => (values.length ? Math.max(...values) : null);

  const earlierTop = maxOf(earlier.map(top).filter((v) => v !== null));
  const earlierE1rm = maxOf(earlier.map((h) => performanceE1rm(h.sets)).filter((v) => v !== null));
  const lastTop = top(last);
  const lastE1rm = performanceE1rm(last.sets);
  const previousTop = earlier.length ? top(earlier.at(-1)) : null;

  return {
    date: last.date,
    newLoadRecord: earlierTop !== null && lastTop !== null && lastTop > earlierTop,
    newE1rmRecord: earlierE1rm !== null && lastE1rm !== null && lastE1rm > earlierE1rm,
    newRepRecords: repRecords(history).filter((r) => r.date === last.date && r.previous !== null),
    loadChangePct: previousTop && lastTop !== null ? Math.round(((lastTop - previousTop) / previousTop) * 1000) / 10 : null,
  };
}

export function exercises(dir, config, id, names, n = 3, today = null) {
  if (!Number.isInteger(n) || n < 1) {
    throw new CoachError(`exercises count must be a positive integer, got ${n}`);
  }

  const athlete = loadAthlete(dir, id, config);
  const db = loadDb(dir);
  const items = [];

  for (const name of names) {
    const resolved = resolveExercise(name, db);
    const canonical = resolved ? resolved.canonical : name;
    const history = entriesFor(athlete, resolved ? canonical : normalizeName(name), db);
    const hasRpeData = history.some((h) => h.sets.some((s) => s.rpe !== null));

    const performances = history.map((h) => ({
      date: h.date,
      sets: h.sets.map(setToText).join(', '),
      e1rm: performanceE1rm(h.sets),
      topLoad: bestLoad(h.sets),
      miss: h.miss,
      // The remark after the dash — where a pain note on one movement lives.
      note: h.note,
      rawSets: h.sets,
    }));

    const withE1rm = performances.filter((p) => p.e1rm !== null);
    const bestPerf = withE1rm.length
      ? withE1rm.reduce((best, p) => (p.e1rm > best.e1rm ? p : best))
      : null;
    const loads = performances.map((p) => p.topLoad).filter((l) => l !== null);
    const added = history.map((h) => bestAddedLoad(h.sets)).filter((l) => l !== null);

    items.push({
      name,
      canonical,
      known: Boolean(resolved),
      main: resolved?.main ?? false,
      prLoad: loads.length ? Math.max(...loads) : null,
      // For a lift done only with bodyweight: the most load ever added to it.
      prAddedLoad: !loads.length && added.length && Math.max(...added) > 0 ? Math.max(...added) : null,
      prE1rm: bestPerf ? bestPerf.e1rm : null,
      prE1rmDate: bestPerf ? bestPerf.date : null,
      smoothed: smoothedE1rm(performances),
      rpeTrusted: rpeTrustworthy(history),
      hasRpeData,
      // All-time performance count, independent of --n — lets a caller judge
      // whether today's entry is even eligible to be a record (it needs a
      // prior performance to beat) without having to request full history.
      totalPerformances: history.length,
      // Like the PRs above, from the whole history rather than the last --n.
      repRecords: repRecords(history),
      latest: latestPerformance(history),
      daysSinceLast: today && history.length ? daysBetween(history.at(-1).date, today) : null,
      performances: performances.slice(-n).reverse(),
    });
  }

  return { athlete: athlete.name, units: athlete.units, items, warnings: [...athlete.warnings, ...tableWarnings(db)] };
}

export function parseSince(since, today) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(since)) {
    assertRealDate(since, 'the period');
    return since;
  }

  const m = /^(\d+)([wmd])$/i.exec(since);
  if (!m) throw new CoachError(`cannot read period "${since}" — use 4w, 3m or YYYY-MM-DD`);

  const n = Number(m[1]);
  const d = new Date(`${today}T00:00:00Z`);
  const unit = m[2].toLowerCase();
  if (unit === 'w') d.setUTCDate(d.getUTCDate() - n * 7);
  else if (unit === 'd') d.setUTCDate(d.getUTCDate() - n);
  else {
    // setUTCMonth() lets an out-of-range day (e.g. the 31st landing in a
    // 30-day or February target month) roll forward into the month after —
    // "1m" from 2026-03-31 must land on 2026-02-28, not overshoot into March.
    // Compute the target year/month explicitly and clamp the day instead.
    const targetIndex = d.getUTCMonth() - n;
    const targetYear = d.getUTCFullYear() + Math.floor(targetIndex / 12);
    const targetMonth = ((targetIndex % 12) + 12) % 12;
    const lastDayOfTarget = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
    d.setUTCFullYear(targetYear, targetMonth, Math.min(d.getUTCDate(), lastDayOfTarget));
  }

  return d.toISOString().slice(0, 10);
}

function avgRpe(sets) {
  const values = sets.map((s) => s.rpe).filter((r) => r !== null);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

// Reps performed at a session's own top load (bodyweight sets excluded, same
// as bestLoad) — used to compare "reps at a fixed load" across sessions.
function repsAtBestLoad(sets) {
  const top = bestLoad(sets);
  if (top === null) return null;
  return sets
    .filter((s) => !s.bw && s.load === top)
    .reduce((sum, s) => sum + s.reps, 0);
}

// Every ISO week touched by the period, in chronological order, including
// weeks with no logged session at all — a missed week must show as zero,
// not disappear from the list.
function weekRange(from, today) {
  const weeks = [];
  const seen = new Set();
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${today}T00:00:00Z`);
  while (d <= end) {
    const label = isoWeek(d.toISOString().slice(0, 10));
    if (!seen.has(label)) {
      seen.add(label);
      weeks.push(label);
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return weeks;
}

// Turns phaseRange()'s segments into what formatReport() and the review
// skill's analyst need: a single phase when exactly one covered the whole
// period, or an honest "mixed" summary — every segment plus which one
// dominated by day count — when the period spans a change. This replaces
// reading only the phase at the period's *start*, which could name a
// phase that covered a handful of the period's days while staying silent
// about the phase that covered the rest.
function reportPhase(range, from, today) {
  if (!range.hasFile || !range.segments.length) {
    return { mixed: false, phase: 'maintain', from: null, to: null, weeks: null, targetRate: null, note: null, segments: [] };
  }

  // Days of the period no row covers are a segment of their own: a single
  // phase is only shown when it covered the whole period, and
  // judging a whole window against a phase that began halfway through it
  // told one story in `report` and another in `phase`.
  const covered = range.segments.reduce((sum, s) => sum + s.daysInPeriod, 0);
  const uncovered = daysBetween(from, today) + 1 - covered;
  const all = uncovered > 0
    ? [...range.segments, { phase: 'unrecorded', from: null, to: null, targetRate: null, note: null, daysInPeriod: uncovered }]
    : range.segments;

  const winner = all.reduce((best, s) => (s.daysInPeriod > best.daysInPeriod ? s : best));
  const segments = all.map((s) => ({ ...s, dominant: s === winner }));

  return {
    mixed: segments.length > 1,
    phase: winner.phase,
    from: winner.from,
    to: winner.to,
    // A dominant phase that has since closed ran until its own To date.
    weeks: winner.from ? Math.floor(daysBetween(winner.from, winner.to ?? today) / 7) : null,
    targetRate: winner.targetRate,
    note: winner.note,
    segments,
  };
}

// Progress is judged against the lift's level six to eight
// weeks earlier, not against a training-age label — the best e1RM of the
// performances in that window, and the change from it to the smoothed
// e1RM now. No performance in the window, no anchor: nothing is guessed.
const ANCHOR_FROM_DAYS = 56;
const ANCHOR_TO_DAYS = 42;

function shiftDate(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function anchorFor(series, smoothedNow, today) {
  const from = shiftDate(today, -ANCHOR_FROM_DAYS);
  const to = shiftDate(today, -ANCHOR_TO_DAYS);
  const window = series.filter((p) => p.date >= from && p.date <= to && p.e1rm !== null);
  if (!window.length || smoothedNow === null) return null;
  const e1rm = Math.max(...window.map((p) => p.e1rm));
  return {
    from: window[0].date,
    to: window.at(-1).date,
    e1rm,
    changePct: Math.round(((smoothedNow - e1rm) / e1rm) * 1000) / 10,
  };
}

function clockMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// Cardio over the period: weekly totals, and for every cardio
// entry logged alongside a lifting session the gap between their start
// times. The gap is a number; whether it is too short is the program
// designers' rule, not this function's.
function cardioOver(days) {
  const weekMap = new Map();
  const sameDay = [];
  for (const day of days) {
    for (const c of day.cardio) {
      const intensity = cardioIntensity(c);
      const week = isoWeek(day.date);
      const w = weekMap.get(week) ?? { week, sessions: 0, minutes: 0, hard: 0, unrated: 0 };
      w.sessions += 1;
      w.minutes += c.minutes;
      if (intensity === 'hard') w.hard += 1;
      if (intensity === null) w.unrated += 1;
      weekMap.set(week, w);

      if (!isLifting(day)) continue;
      const cardioAt = clockMinutes(c.time);
      const liftAt = clockMinutes(day.time);
      const known = cardioAt !== null && liftAt !== null;
      sameDay.push({
        date: day.date,
        modality: c.modality,
        minutes: c.minutes,
        intensity,
        gapHours: known ? Math.abs(liftAt - cardioAt) / 60 : null,
        order: known ? (cardioAt <= liftAt ? 'before' : 'after') : null,
      });
    }
  }
  const weeks = [...weekMap.values()].sort((a, b) => a.week.localeCompare(b.week));
  return { weeks, sameDay };
}

// Names logged in the period that the table doesn't know: their volume goes
// under "unknown" and they have no muscles, so review should hear about them.
function unknownInPeriod(days, db) {
  if (db.missing) return [];
  const keyOf = exerciseKeyer(db);
  for (const day of days) for (const entry of day.actual) keyOf(entry.name);
  return keyOf.unknown.size
    ? [`exercise names not in exercises.md: ${[...keyOf.unknown].join(', ')} — /coach:exercise adds them`]
    : [];
}

export function report(dir, config, id, since, today) {
  const athlete = loadAthlete(dir, id, config);
  const db = loadDb(dir);
  const keyOf = exerciseKeyer(db);
  const from = parseSince(since, today);

  // The phase (or phases) that actually covered the *period*, not just
  // whichever one happened to be running at its first moment — a period
  // that spans a phase change must say so honestly rather than picking one
  // end of it.
  const phaseRangeResult = phaseRange(dir, id, from, today);
  const periodPhase = reportPhase(phaseRangeResult, from, today);

  const done = athlete.days.filter((d) => d.status === 'done');
  // Lifting sessions inside the period: what frequency, volume and the
  // feel signal are about. A cardio-only day is counted by cardioOver.
  const inPeriod = done.filter((d) => isLifting(d) && d.date >= from && d.date <= today);

  const byExercise = new Map();
  for (const day of done) {
    for (const entry of day.actual) {
      const resolved = resolveExercise(entry.name, db);
      const canonical = keyOf(entry.name);
      if (!byExercise.has(canonical)) byExercise.set(canonical, { resolved, history: [] });
      byExercise.get(canonical).history.push({ date: day.date, sets: entry.sets });
    }
  }

  const prs = [];
  const mains = [];
  const stalls = [];
  const fatigueSignals = [];

  for (const [canonical, { resolved, history }] of byExercise) {
    const series = history.map((h) => ({
      date: h.date,
      e1rm: performanceE1rm(h.sets),
      topLoad: bestLoad(h.sets) ?? bestAddedLoad(h.sets),
      totalReps: h.sets.reduce((s, x) => s + x.reps, 0),
      avgRpe: avgRpe(h.sets),
    }));

    const before = series.filter((p) => p.date < from);
    const during = series.filter((p) => p.date >= from && p.date <= today);
    if (!during.length) continue;

    // A record beats an earlier value. A first-ever performance, or one whose
    // earlier sessions carried no e1RM at all, is a starting point — the rule
    // log applies — and a missing e1RM is never a zero to beat.
    const earlier = before.map((p) => p.e1rm).filter((v) => v !== null);
    const inside = during.map((p) => p.e1rm).filter((v) => v !== null);
    if (earlier.length && inside.length) {
      const bestBefore = Math.max(...earlier);
      const bestDuring = Math.max(...inside);
      if (bestDuring > bestBefore) {
        prs.push({ canonical, e1rm: bestDuring, date: during.find((p) => p.e1rm === bestDuring)?.date ?? null });
      }
    }

    if (resolved?.main) {
      const trusted = rpeTrustworthy(history);
      const smoothedNow = smoothedE1rm(series.filter((p) => p.date <= today));
      mains.push({
        canonical,
        trend: trend(during),
        smoothed: smoothedNow,
        performances: during.length,
        rpeTrusted: trusted,
        anchor: anchorFor(series, smoothedNow, today),
      });
      if (detectStall(series, trusted)) stalls.push(canonical);

      // Fatigue signal: the smoothed e1RM (max of the trailing three
      // performances) as of the start of the period versus now — falls only
      // once a session that anchored the earlier ceiling ages out of the
      // trailing window, so this needs the exercise's whole history, not
      // just what's inside the period.
      const idxFirstDuring = series.findIndex((p) => p.date >= from);
      if (idxFirstDuring !== -1) {
        const smoothedAtStart = smoothedE1rm(series.slice(0, idxFirstDuring + 1));
        if (smoothedAtStart !== null && smoothedNow !== null && smoothedAtStart > 0
            && (smoothedAtStart - smoothedNow) / smoothedAtStart >= 0.01) {
          fatigueSignals.push(
            `${canonical}: smoothed e1RM fell ${smoothedAtStart.toFixed(1)} → ${smoothedNow.toFixed(1)} ${athlete.units}`,
          );
        }
      }
    }
  }

  // What the athlete wrote after the dash on a lift line — where a pain
  // remark about one movement lives, which review's analyst must see.
  const notes = [];
  for (const day of inPeriod) {
    for (const entry of day.actual) {
      if (entry.note) notes.push({ canonical: keyOf(entry.name), date: day.date, note: entry.note });
    }
  }

  // Where a failed set stopped — the only trace of it a log without video
  // keeps, verbatim in the athlete's own words.
  const misses = [];
  for (const day of inPeriod) {
    for (const entry of day.actual) {
      if (!entry.miss) continue;
      misses.push({ canonical: keyOf(entry.name), date: day.date, where: entry.miss });
    }
  }

  const volumeMap = new Map();
  const tonnageMap = new Map();
  for (const day of inPeriod) {
    const week = isoWeek(day.date);
    for (const entry of day.actual) {
      const resolved = resolveExercise(entry.name, db);
      const canonical = keyOf(entry.name);
      const muscle = resolved?.muscles[0] ?? 'unknown';
      const volumeKey = `${week}|${muscle}`;
      volumeMap.set(volumeKey, (volumeMap.get(volumeKey) ?? 0) + entry.sets.length);

      // Tonnage per exercise, not per muscle — bodyweight sets carry
      // no load and never contribute.
      const setTonnage = entry.sets
        .filter((s) => !s.bw && s.load !== null)
        .reduce((sum, s) => sum + s.load * s.reps, 0);
      if (setTonnage > 0) {
        const tonnageKey = `${week}|${canonical}`;
        tonnageMap.set(tonnageKey, (tonnageMap.get(tonnageKey) ?? 0) + setTonnage);
      }
    }
  }
  const volume = [...volumeMap.entries()]
    .map(([key, sets]) => {
      const [week, muscle] = key.split('|');
      return { week, muscle, sets };
    })
    .sort((a, b) => (a.week === b.week ? b.sets - a.sets : a.week.localeCompare(b.week)));

  const tonnage = [...tonnageMap.entries()]
    .map(([key, kg]) => {
      const [week, exercise] = key.split('|');
      return { week, exercise, kg };
    })
    .sort((a, b) => (a.week === b.week ? b.kg - a.kg : a.week.localeCompare(b.week)));

  const doneByWeek = new Map();
  for (const day of inPeriod) {
    const week = isoWeek(day.date);
    doneByWeek.set(week, (doneByWeek.get(week) ?? 0) + 1);
  }
  // A week with no closed session is attendance news, not an absence of
  // data — every ISO week in the period is listed, zero-filled if empty.
  const frequency = weekRange(from, today).map((week) => ({
    week,
    done: doneByWeek.get(week) ?? 0,
    target: athlete.daysPerWeek,
  }));

  for (const [canonical, { resolved, history }] of byExercise) {
    if (!resolved?.main) continue;
    const recent = history.filter((h) => h.date >= from && h.date <= today);
    if (recent.length < 2) continue;

    const first = recent[0];
    const last = recent.at(-1);
    const rpeFirst = avgRpe(first.sets);
    const rpeLast = avgRpe(last.sets);
    const loadFirst = bestLoad(first.sets);
    const loadLast = bestLoad(last.sets);
    const sameLoad = loadFirst !== null && loadLast !== null && Math.abs(loadLast - loadFirst) < 0.01;

    if (rpeFirst !== null && rpeLast !== null && sameLoad && rpeLast - rpeFirst >= 1) {
      fatigueSignals.push(`${canonical}: RPE rose ${rpeFirst.toFixed(1)} → ${rpeLast.toFixed(1)} at the same load`);
    }

    const repsFirst = repsAtBestLoad(first.sets);
    const repsLast = repsAtBestLoad(last.sets);
    if (repsFirst !== null && repsLast !== null && sameLoad && repsLast < repsFirst) {
      fatigueSignals.push(`${canonical}: reps at ${loadLast} ${athlete.units} fell ${repsFirst} → ${repsLast}`);
    }
  }

  const feels = inPeriod.map((d) => d.feel).filter((f) => f !== null);
  if (feels.length >= 3 && feels.at(-1) <= 2) {
    fatigueSignals.push(`feel dropped to ${feels.at(-1)} in the last session`);
  }

  const skipped = athlete.days.filter((d) => d.status === 'skipped' && d.date >= from && d.date <= today).length;
  if (skipped >= 2) fatigueSignals.push(`${skipped} sessions skipped in the period`);

  return {
    athlete: athlete.name,
    units: athlete.units,
    since: from,
    // How long since anyone confirmed the profile the specialists read as
    // current fact.
    profile: profileFreshness(dir, id, today),
    // Bodyweight over the report's own period, judged against whichever
    // phase covered it.
    // Judged on the dominant phase's own dates inside the period: its
    // target says nothing about the weeks before it began.
    bodyweight: bodyweightOver(
      athlete,
      periodPhase.from && periodPhase.from > from ? periodPhase.from : from,
      periodPhase.to && periodPhase.to < today ? periodPhase.to : today,
      periodPhase.targetRate,
    ),
    // Closed lifting sessions inside the period. Zero is a report of its
    // own — see formatReport, which stops there rather than printing empty
    // tables.
    sessions: inPeriod.length,
    phase: {
      mixed: periodPhase.mixed,
      phase: periodPhase.phase,
      from: periodPhase.from,
      weeks: periodPhase.weeks,
      targetRate: periodPhase.targetRate,
      note: periodPhase.note,
      segments: periodPhase.segments,
    },
    prs,
    mains,
    stalls,
    volume,
    tonnage,
    frequency,
    misses,
    notes,
    // Every file in the period, whatever its status: plan never writes a
    // cardio section, so one is always a record of cardio actually done —
    // a run before a lifting session later skipped still happened.
    cardio: cardioOver(athlete.days.filter((d) => d.date >= from && d.date <= today)),
    fatigueSignals,
    warnings: [
      ...athlete.warnings,
      ...phaseRangeResult.warnings,
      ...tableWarnings(db),
      ...unknownInPeriod(inPeriod, db),
    ],
  };
}

// export: the athlete's own data, flat, for a spreadsheet or a chart. Rows
// carry what the files hold plus what this module computes (canonical
// names, e1RM, cardio intensity), so a chart never recomputes a figure.
const EXPORT_COLUMNS = {
  sets: ['date', 'session', 'exercise', 'set', 'load', 'bodyweight_set', 'bw_offset', 'reps', 'rpe', 'e1rm', 'units', 'note', 'miss'],
  sessions: ['date', 'session', 'status', 'time', 'duration_min', 'feel', 'bodyweight', 'exercises', 'sets', 'cardio_min', 'units'],
  cardio: ['date', 'session', 'modality', 'minutes', 'rpe', 'zone', 'distance', 'time', 'intensity', 'note'],
};

// `since` null means the whole history. Nothing after today, like report.
export function exportRows(dir, config, id, table, since, today) {
  const columns = EXPORT_COLUMNS[table];
  if (!columns) {
    throw new CoachError(`export needs a table: sets, sessions or cardio${table ? ` — not "${table}"` : ''}`);
  }

  const athlete = loadAthlete(dir, id, config);
  const db = loadDb(dir);
  const keyOf = exerciseKeyer(db);
  const from = since ? parseSince(since, today) : null;
  const days = athlete.days.filter((d) => (from === null || d.date >= from) && d.date <= today);
  const rows = [];

  if (table === 'sets') {
    for (const day of days) {
      if (day.status !== 'done') continue;
      for (const entry of day.actual) {
        const exercise = keyOf(entry.name);
        entry.sets.forEach((s, i) => {
          const e1rm = setE1rm(s);
          rows.push({
            date: day.date,
            session: day.session,
            exercise,
            set: i + 1,
            load: s.load,
            bodyweight_set: s.bw,
            bw_offset: s.bw ? s.bwOffset : null,
            reps: s.reps,
            rpe: s.rpe,
            e1rm: e1rm === null ? null : Math.round(e1rm * 10) / 10,
            units: athlete.units,
            note: entry.note,
            miss: entry.miss,
          });
        });
      }
    }
  } else if (table === 'sessions') {
    for (const day of days) {
      rows.push({
        date: day.date,
        session: day.session,
        status: day.status,
        time: day.time,
        duration_min: day.durationMin,
        feel: day.feel,
        bodyweight: day.bodyweight,
        exercises: day.actual.length,
        sets: day.actual.reduce((sum, e) => sum + e.sets.length, 0),
        cardio_min: day.cardio.reduce((sum, c) => sum + c.minutes, 0),
        units: athlete.units,
      });
    }
  } else {
    for (const day of days) {
      for (const c of day.cardio) {
        rows.push({
          date: day.date,
          session: day.session,
          modality: c.modality,
          minutes: c.minutes,
          rpe: c.rpe,
          zone: c.zone,
          distance: c.distance,
          time: c.time,
          intensity: cardioIntensity(c),
          note: c.note,
        });
      }
    }
  }

  return { columns, rows, warnings: athlete.warnings };
}

// /coach:exercise's two writes to the folder's exercises.md. Every check
// lives in exercises.mjs; the file is only written once the change passed.
function exercisesPath(dir) {
  const path = join(dir, 'exercises.md');
  if (!existsSync(path)) throw new CoachError(`no exercises.md in ${dir} — run /coach:init first`);
  return path;
}

export function exerciseAdd(dir, config, spec) {
  const path = exercisesPath(dir);
  const r = addExerciseRow(readFileSync(path, 'utf8'), spec, config.language ?? 'en');
  if (r.error) throw new CoachError(r.error);
  writeFileSync(path, r.text);
  return { action: 'added', ...r.row };
}

export function exerciseAlias(dir, config, target, aliases) {
  const path = exercisesPath(dir);
  const r = addAliases(readFileSync(path, 'utf8'), target, aliases);
  if (r.error) throw new CoachError(r.error);
  writeFileSync(path, r.text);
  return { action: 'aliased', canonical: r.canonical, added: r.added };
}

// `load` and `warmup`: what to put on the bar, from the athlete's own gym
// file — own or shared, the same rule the hook and the skills use.
function gymFor(dir, config, id) {
  const own = config.athletes[id]?.gym === 'own';
  const path = own ? join(dir, 'athletes', id, 'gym.md') : join(dir, 'gym.md');
  if (!existsSync(path)) throw new CoachError(`no ${own ? `athletes/${id}/gym.md` : 'gym.md'} — /coach:gym records the equipment`);
  return { gym: parseGymLoads(readFileSync(path, 'utf8')), file: own ? `athletes/${id}/gym.md` : 'gym.md' };
}

function positiveLoad(value) {
  const n = Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) throw new CoachError(`a load must be a positive number, got "${value}"`);
  return n;
}

export function loadFor(dir, config, id, target, { dumbbell = false } = {}) {
  const t = positiveLoad(target);
  const { gym, file } = gymFor(dir, config, id);
  const units = config.athletes[id]?.units ?? config.units;
  if (dumbbell) {
    if (!gym.dumbbells) throw new CoachError(`${file} has no "- dumbbells:" line (e.g. "- dumbbells: 2–40 step 2") — /coach:gym adds it`);
    return { target: t, units, dumbbell: true, load: nearestDumbbell(t, gym) };
  }
  if (!gym.bar || !gym.plates.length) {
    throw new CoachError(`${file} has no "- bar:" and "- plates:" lines (e.g. "- bar: 20", "- plates: 25, 20, 15, 10, 5, 2.5, 1.25") — /coach:gym adds them`);
  }
  return { target: t, units, dumbbell: false, ...nearestBarbell(t, gym) };
}

export function warmupFor(dir, config, id, working) {
  const w = positiveLoad(working);
  const { gym, file } = gymFor(dir, config, id);
  if (!gym.bar || !gym.plates.length) {
    throw new CoachError(`${file} has no "- bar:" and "- plates:" lines — /coach:gym adds them`);
  }
  return { working: nearestBarbell(w, gym).load, units: config.athletes[id]?.units ?? config.units, steps: warmupLadder(w, gym) };
}
