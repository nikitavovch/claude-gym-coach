// e1RM, smoothing, trends, stalls, records and fatigue signals: the
// arithmetic behind every figure the coach reports, so no prompt derives one.

const MAX_EFFECTIVE_REPS = 10;
const MIN_RPE = 6;

function effectiveReps(set) {
  if (set.rpe === null) return set.reps;
  return set.reps + (10 - set.rpe);
}

export function setE1rm(set) {
  if (set.bw || set.load === null) return null;
  if (set.rpe !== null && set.rpe < MIN_RPE) return null;

  const r = effectiveReps(set);
  if (r < 1 || r > MAX_EFFECTIVE_REPS) return null;

  const w = set.load;
  const epley = w * (1 + r / 30);
  const brzycki = (w * 36) / (37 - r);
  const wathan = (100 * w) / (48.8 + 53.8 * Math.exp(-0.075 * r));
  return (epley + brzycki + wathan) / 3;
}

export function performanceE1rm(sets) {
  const values = sets.map(setE1rm).filter((v) => v !== null);
  return values.length ? Math.max(...values) : null;
}

export function smoothedE1rm(series) {
  const valid = series.filter((p) => p.e1rm !== null);
  if (!valid.length) return null;
  const last = valid.slice(-3);
  return Math.max(...last.map((p) => p.e1rm));
}

export function bestLoad(sets) {
  const loads = sets.filter((s) => !s.bw && s.load !== null).map((s) => s.load);
  return loads.length ? Math.max(...loads) : null;
}

// The added load on a bodyweight set — BW+25 is 25, plain BW is 0. Among
// the bodyweight sets of one exercise it is the comparable load: a pull-up
// going from BW+10 to BW+25 at the same reps is progress, and without this
// every weighted pull-up or dip read as a stall with no record ever.
export function bestAddedLoad(sets) {
  const offsets = sets.filter((s) => s.bw).map((s) => s.bwOffset);
  return offsets.length ? Math.max(...offsets) : null;
}

const RETRUST_SPREAD = 1.5;
const RETRUST_MIN_RPE = 9;
const RETRUST_WINDOW_DAYS = 28;

// Trust in RPE comes back: a single session with a rating spread
// >=1.5 and at least one set rated >=9, within the trailing four weeks,
// overrides any of the three distrust heuristics below.
function hasRetrustSignal(history) {
  if (!history.length) return false;
  const anchor = history.reduce((max, h) => (h.date > max ? h.date : max), history[0].date);
  return history.some((h) => {
    const daysOld = (Date.parse(anchor) - Date.parse(h.date)) / 86400000;
    if (daysOld > RETRUST_WINDOW_DAYS) return false;
    const values = h.sets.map((s) => s.rpe).filter((r) => r !== null);
    if (!values.length) return false;
    const spread = Math.max(...values) - Math.min(...values);
    return spread >= RETRUST_SPREAD && Math.max(...values) >= RETRUST_MIN_RPE;
  });
}

export function rpeTrustworthy(history) {
  const recent = history.slice(-3);
  if (recent.length < 3) return true;

  const rpes = recent.flatMap((h) => h.sets.map((s) => s.rpe)).filter((r) => r !== null);
  if (!rpes.length) return false;

  let distrusted = false;

  // Heuristic: the rating never varies across the whole recent window,
  // whether that's one rated set per session or five.
  if (new Set(rpes).size === 1) distrusted = true;

  // Heuristic: the rating ceiling stays at or below 7 while load has stalled.
  const loads = recent.map((h) => bestLoad(h.sets)).filter((l) => l !== null);
  const loadStalled = loads.length >= 3 && Math.max(...loads) - Math.min(...loads) < 0.01;
  if (loadStalled && Math.max(...rpes) <= 7) distrusted = true;

  // Heuristic: a set at the heaviest load anywhere in the history was rated <=7.
  const allLoads = history.flatMap((h) => h.sets).filter((s) => !s.bw && s.load !== null).map((s) => s.load);
  if (allLoads.length) {
    const prLoad = Math.max(...allLoads);
    const prSets = history.flatMap((h) => h.sets).filter((s) => !s.bw && s.load === prLoad);
    if (prSets.some((s) => s.rpe !== null && s.rpe <= 7)) distrusted = true;
  }

  if (!distrusted) return true;
  return hasRetrustSignal(history);
}

export function detectStall(series, trusted) {
  // The e1RM rule needs an e1RM on every performance: a missing one is not
  // a zero, and a bodyweight lift never has one. Anything else falls back
  // to the load-and-reps rule below.
  if (trusted && series.every((p) => p.e1rm !== null)) {
    if (series.length < 4) return false;
    const recent = series.slice(-3);
    const before = series.slice(0, -3);
    const bestBefore = Math.max(...before.map((p) => p.e1rm ?? 0));
    const grew = recent.some((p) => (p.e1rm ?? 0) > bestBefore);
    if (grew) return false;

    const priorRpes = before.map((p) => p.avgRpe).filter((r) => r !== null && r !== undefined);
    const rpeBefore = priorRpes.length
      ? priorRpes.reduce((s, v) => s + v, 0) / priorRpes.length
      : null;
    const rpeNow = recent.at(-1)?.avgRpe ?? null;
    if (rpeBefore === null || rpeNow === null) return false;
    return rpeNow - rpeBefore >= 1;
  }

  if (series.length < 3) return false;
  const [a, b, c] = series.slice(-3);
  if ([a, b, c].some((p) => p.topLoad === null || p.topLoad === undefined)) return false;
  const noLoadGain = c.topLoad <= a.topLoad && b.topLoad <= a.topLoad;
  const noRepGain = c.totalReps <= a.totalReps && b.totalReps <= a.totalReps;
  return noLoadGain && noRepGain;
}

function daysBetween(a, b) {
  return (Date.parse(b) - Date.parse(a)) / 86400000;
}

export function trend(series) {
  const points = series.filter((p) => p.e1rm !== null);
  if (points.length < 3) return 'insufficient';

  const x0 = points[0].date;
  const xs = points.map((p) => daysBetween(x0, p.date) / 7);
  const ys = points.map((p) => p.e1rm);
  const n = xs.length;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  if (den === 0) return 'insufficient';

  const slopePerWeek = num / den;
  const relative = slopePerWeek / meanY;
  if (relative > 0.01) return 'up';
  if (relative < -0.01) return 'down';
  return 'flat';
}

// --- Bodyweight trend ----------------------------------------
//
// The same least-squares regression `trend` above runs on e1RM, with x in
// weeks so the slope is already per week. One guard is added that e1RM does
// not need: e1RM points are training sessions, naturally spread over weeks,
// while bodyweight can be logged Monday, Tuesday and Wednesday. Three such
// points give a sound slope that extrapolates a day of water weight into a
// weekly rate, so the span counts as much as the number of entries.
const BW_MIN_ENTRIES = 3;
const BW_MIN_SPAN_DAYS = 14;

export function bodyweightTrend(series) {
  const points = series
    .filter((p) => typeof p.bodyweight === 'number' && Number.isFinite(p.bodyweight))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  const n = points.length;
  const summary = {
    enough: false,
    n,
    from: n ? points[0].date : null,
    to: n ? points[n - 1].date : null,
    first: n ? points[0].bodyweight : null,
    last: n ? points[n - 1].bodyweight : null,
    mean: null,
    perWeek: null,
    pctPerWeek: null,
  };

  if (n < BW_MIN_ENTRIES) return summary;
  if (daysBetween(points[0].date, points[n - 1].date) < BW_MIN_SPAN_DAYS) return summary;

  const xs = points.map((p) => daysBetween(points[0].date, p.date) / 7);
  const ys = points.map((p) => p.bodyweight);
  const meanX = xs.reduce((acc, v) => acc + v, 0) / n;
  const meanY = ys.reduce((acc, v) => acc + v, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  // Every entry on one date: no line to fit, and no rate to report.
  if (den === 0 || meanY === 0) return summary;

  const perWeek = num / den;
  return { ...summary, enough: true, mean: meanY, perWeek, pctPerWeek: (perWeek / meanY) * 100 };
}

// How a measured trend compares with the phase's target. Only ever
// called with a target `parseTargetRate` understood — a free-text target
// gets no verdict at all, because guessing one is inventing a number.
//
// The tolerance is 0.15 %/wk: roughly a day's water weight spread over a
// week. For a target written in kg or lb per week, the same tolerance is
// expressed in those units off the measured mean. That converts the
// *tolerance*, never the target: converting the target would need the
// athlete's weight on the day it was set, which phases.md does not store.
const RATE_TOLERANCE_PCT = 0.15;

export function rateVerdict(trendResult, target) {
  if (!target || !trendResult?.enough) return null;

  const pct = target.kind === 'pct';
  const actual = pct ? trendResult.pctPerWeek : trendResult.perWeek;
  const tolerance = pct
    ? RATE_TOLERANCE_PCT
    : (RATE_TOLERANCE_PCT / 100) * trendResult.mean;
  if (actual === null || !Number.isFinite(tolerance)) return null;

  if (Math.abs(actual - target.value) < tolerance) return 'on track';
  // Opposite signs, by product rather than Math.sign: a flat trend (0) is
  // not the opposite of anything, it is simply slower than a target.
  if (actual * target.value < 0) return 'wrong direction';
  if (Math.abs(actual) > Math.abs(target.value)) return 'faster than target';
  return 'slower than target';
}

// Rep records: for each rep count 1..12, the heaviest load
// lifted for *at least* that many reps — 100x5 also stands as a 3-rep
// best, so the table never claims a lighter 3RM than a set already proves.
// `previous` is the record it beat, null for the first value at that count:
// a first-ever set of ten is a starting point, not a record to announce.
// Only a strictly heavier load replaces a record; matching one does not.
// Bodyweight sets carry no load and are left out.
const REP_RECORD_MAX = 12;

export function repRecords(history) {
  // A lift logged only with bodyweight sets, some of them with added load,
  // is ranked by that load (BW+25 → 25); records then carry `bw: true`.
  // Plain bodyweight work (BW, never BW+) has no load to rank.
  const all = history.flatMap((h) => h.sets);
  const byAdded = !all.some((s) => !s.bw && s.load !== null) && all.some((s) => s.bw && s.bwOffset > 0);
  const loadOf = (s) => (byAdded ? (s.bw ? s.bwOffset : null) : (!s.bw ? s.load : null));
  const best = new Map();
  for (const { date, sets } of history) {
    for (let reps = 1; reps <= REP_RECORD_MAX; reps += 1) {
      const loads = sets.filter((s) => loadOf(s) !== null && s.reps >= reps).map(loadOf);
      if (!loads.length) continue;
      const load = Math.max(...loads);
      const current = best.get(reps);
      if (!current || load > current.load) {
        best.set(reps, { reps, load, date, previous: current ? current.load : null, ...(byAdded ? { bw: true } : {}) });
      }
    }
  }
  return [...best.values()].sort((a, b) => a.reps - b.reps);
}

// Easy or hard, from whichever scale the athlete logged: a session RPE
// (1..10) or a heart-rate zone (Z1..Z5). Neither logged means null, never
// a guess — review then sees the entry as unrated. The split follows
// the project's research notes on hybrid training: Z1–Z2 is the easy cardio that needs
// no lifting cut; intervals, tempo and threshold work are the hard end.
//
// Every doubt resolves towards 'hard': Z3 tempo, and the heavier of RPE and
// zone when they disagree. A cardio session wrongly called hard only softens
// a fatigue reading; one wrongly called easy can cost a needless deload.
// A long session is hard whatever its zone — the research names long runs
// alongside intervals — so it needs no rating to be judged.
const CARDIO_HARD_ZONE = 3;
const CARDIO_HARD_RPE = 7;
const CARDIO_LONG_MIN = 90;

export function cardioIntensity(entry) {
  const rated = entry.rpe !== null || entry.zone !== null;
  if ((entry.zone ?? 0) >= CARDIO_HARD_ZONE
      || (entry.rpe ?? 0) >= CARDIO_HARD_RPE
      || entry.minutes >= CARDIO_LONG_MIN) return 'hard';
  return rated ? 'easy' : null;
}

export function isoWeek(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((d - firstThursday) / (7 * 86400000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
