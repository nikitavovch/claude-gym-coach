import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  setE1rm, performanceE1rm, smoothedE1rm, bestLoad,
  rpeTrustworthy, detectStall, trend, isoWeek, bodyweightTrend, rateVerdict,
  cardioIntensity, repRecords,
} from '../scripts/lib/calc.mjs';

const set = (load, reps, rpe = null) => ({ load, bw: false, bwOffset: 0, reps, rpe });

test('e1RM of a five-rep set sits between the formulas', () => {
  const v = setE1rm(set(100, 5));
  assert.ok(v > 110 && v < 120, `got ${v}`);
});

test('a single at RPE 10 is within a couple of percent of its load', () => {
  // The ensemble is not exact at one rep: Epley gives 103.3, Brzycki 100, Wathan 101.3.
  const v = setE1rm(set(100, 1, 10));
  assert.ok(v >= 100 && v <= 103, `got ${v}`);
});

test('RPE lowers the effective reps', () => {
  assert.ok(setE1rm(set(100, 5, 8)) > setE1rm(set(100, 5, 10)));
});

test('bodyweight sets have no e1RM', () => {
  assert.equal(setE1rm({ load: null, bw: true, bwOffset: 0, reps: 8, rpe: null }), null);
});

test('sets beyond the ten-rep window are excluded', () => {
  assert.equal(setE1rm(set(60, 15)), null);
});

test('RPE below six is excluded', () => {
  assert.equal(setE1rm(set(60, 5, 5)), null);
});

test('performance takes the best set', () => {
  const v = performanceE1rm([set(100, 5), set(120, 1), set(80, 8)]);
  assert.equal(v, Math.max(setE1rm(set(100, 5)), setE1rm(set(120, 1)), setE1rm(set(80, 8))));
});

test('smoothing takes the best of the last three', () => {
  const series = [
    { date: '2026-01-01', e1rm: 200 },
    { date: '2026-02-01', e1rm: 100 },
    { date: '2026-03-01', e1rm: 110 },
    { date: '2026-04-01', e1rm: 105 },
  ];
  assert.equal(smoothedE1rm(series), 110);
});

test('best load ignores bodyweight sets', () => {
  assert.equal(bestLoad([set(100, 5), { load: null, bw: true, bwOffset: 0, reps: 20, rpe: null }]), 100);
});

test('RPE is distrusted when it never varies', () => {
  const history = [
    { date: '2026-01-01', sets: [set(100, 5, 8), set(100, 5, 8), set(100, 5, 8)] },
    { date: '2026-01-08', sets: [set(100, 5, 8), set(100, 5, 8), set(100, 5, 8)] },
    { date: '2026-01-15', sets: [set(100, 5, 8), set(100, 5, 8), set(100, 5, 8)] },
  ];
  assert.equal(rpeTrustworthy(history), false);
});

test('RPE is distrusted when it never exceeds seven while loads stall', () => {
  const history = [
    { date: '2026-01-01', sets: [set(100, 5, 6), set(100, 5, 7)] },
    { date: '2026-01-08', sets: [set(100, 5, 7), set(100, 5, 6.5)] },
    { date: '2026-01-15', sets: [set(100, 5, 6.5), set(100, 5, 7)] },
  ];
  assert.equal(rpeTrustworthy(history), false);
});

test('RPE is trusted when it varies and reaches nine', () => {
  const history = [
    { date: '2026-01-01', sets: [set(100, 5, 7), set(100, 5, 8.5)] },
    { date: '2026-01-08', sets: [set(102.5, 5, 7.5), set(102.5, 5, 9)] },
    { date: '2026-01-15', sets: [set(105, 5, 8), set(105, 4, 9.5)] },
  ];
  assert.equal(rpeTrustworthy(history), true);
});

test('RPE is distrusted when one rated set per session never varies', () => {
  const history = [
    { date: '2026-01-01', sets: [set(100, 5, 8)] },
    { date: '2026-01-08', sets: [set(100, 5, 8)] },
    { date: '2026-01-15', sets: [set(100, 5, 8)] },
  ];
  assert.equal(rpeTrustworthy(history), false);
});

test('RPE is distrusted when a set at the heaviest load in the history is rated seven', () => {
  const history = [
    { date: '2026-01-01', sets: [set(100, 5, 8)] },
    { date: '2026-01-08', sets: [set(105, 5, 7)] },
    { date: '2026-01-15', sets: [set(102, 5, 8.5)] },
  ];
  assert.equal(rpeTrustworthy(history), false);
});

test('RPE regains trust after a varied high-effort session within four weeks', () => {
  const history = [
    { date: '2026-01-01', sets: [set(100, 5, 7), set(105, 3, 9.5)] },
    { date: '2026-01-08', sets: [set(100, 5, 7), set(100, 5, 7)] },
    { date: '2026-01-15', sets: [set(100, 5, 7), set(100, 5, 7)] },
    { date: '2026-01-22', sets: [set(100, 5, 7), set(100, 5, 7)] },
  ];
  assert.equal(rpeTrustworthy(history), true);
});

test('RPE stays distrusted when the varied session is more than four weeks old', () => {
  const history = [
    { date: '2025-12-01', sets: [set(100, 5, 7), set(105, 3, 9.5)] },
    { date: '2026-01-08', sets: [set(100, 5, 7), set(100, 5, 7)] },
    { date: '2026-01-15', sets: [set(100, 5, 7), set(100, 5, 7)] },
    { date: '2026-01-22', sets: [set(100, 5, 7), set(100, 5, 7)] },
  ];
  assert.equal(rpeTrustworthy(history), false);
});

test('two flat sessions are a stall when RPE is not trusted', () => {
  const series = [
    { date: '2026-01-01', e1rm: 120, topLoad: 100, totalReps: 15 },
    { date: '2026-01-08', e1rm: 120, topLoad: 100, totalReps: 15 },
    { date: '2026-01-15', e1rm: 120, topLoad: 100, totalReps: 15 },
  ];
  assert.equal(detectStall(series, false), true);
});

test('rising load is not a stall', () => {
  const series = [
    { date: '2026-01-01', e1rm: 120, topLoad: 100, totalReps: 15 },
    { date: '2026-01-08', e1rm: 123, topLoad: 102.5, totalReps: 15 },
  ];
  assert.equal(detectStall(series, false), false);
});

test('trusted stall: flat estimated max with effort rising a full point is a stall', () => {
  const series = [
    { date: '2026-01-01', e1rm: 120, avgRpe: 7 },
    { date: '2026-01-08', e1rm: 118, avgRpe: 7.2 },
    { date: '2026-01-15', e1rm: 119, avgRpe: 7.5 },
    { date: '2026-01-22', e1rm: 120, avgRpe: 8 },
  ];
  assert.equal(detectStall(series, true), true);
});

test('trusted stall: a growing estimated max is never a stall', () => {
  const series = [
    { date: '2026-01-01', e1rm: 120, avgRpe: 7 },
    { date: '2026-01-08', e1rm: 118, avgRpe: 7.2 },
    { date: '2026-01-15', e1rm: 119, avgRpe: 7.5 },
    { date: '2026-01-22', e1rm: 130, avgRpe: 8 },
  ];
  assert.equal(detectStall(series, true), false);
});

test('trusted stall: baseline uses the mean of prior sessions, not just the last one', () => {
  const series = [
    { date: '2025-11-01', e1rm: 120, avgRpe: 9 },
    { date: '2025-11-08', e1rm: 118, avgRpe: 9 },
    { date: '2025-11-15', e1rm: 119, avgRpe: 6 },
    { date: '2025-11-22', e1rm: 119, avgRpe: 7 },
    { date: '2025-11-29', e1rm: 118, avgRpe: 7.1 },
    { date: '2025-12-06', e1rm: 119, avgRpe: 7.2 },
  ];
  assert.equal(detectStall(series, true), false);
});

test('rising trend is detected', () => {
  const series = [
    { date: '2026-01-01', e1rm: 100 },
    { date: '2026-01-08', e1rm: 104 },
    { date: '2026-01-15', e1rm: 108 },
    { date: '2026-01-22', e1rm: 112 },
  ];
  assert.equal(trend(series), 'up');
});

test('flat trend is detected', () => {
  const series = [
    { date: '2026-01-01', e1rm: 100 },
    { date: '2026-01-08', e1rm: 100.2 },
    { date: '2026-01-15', e1rm: 99.8 },
  ];
  assert.equal(trend(series), 'flat');
});

test('two points are not enough for a trend', () => {
  assert.equal(trend([{ date: '2026-01-01', e1rm: 100 }, { date: '2026-01-08', e1rm: 110 }]), 'insufficient');
});

test('ISO week is formatted', () => {
  assert.equal(isoWeek('2026-09-21'), '2026-W39');
});

// --- bodyweight trend -------------------------------------------------

const bwSeries = (pairs) => pairs.map(([date, kg]) => ({ date, bodyweight: kg }));

test('bodyweight trend is the regression slope, per week and as a percent', () => {
  const t = bodyweightTrend(bwSeries([
    ['2026-01-01', 80], ['2026-01-08', 79], ['2026-01-15', 78],
  ]));
  assert.equal(t.enough, true);
  assert.equal(t.n, 3);
  assert.equal(Math.round(t.perWeek * 100) / 100, -1);
  // -1 kg/wk against a 79 kg mean
  assert.equal(Math.round(t.pctPerWeek * 100) / 100, -1.27);
  assert.equal(t.from, '2026-01-01');
  assert.equal(t.to, '2026-01-15');
});

test('fewer than three entries is not enough data', () => {
  const t = bodyweightTrend(bwSeries([['2026-01-01', 80], ['2026-01-15', 79]]));
  assert.equal(t.enough, false);
  assert.equal(t.n, 2);
  assert.equal(t.perWeek, null);
});

// Three weights logged Monday-Wednesday give a mathematically sound slope
// that extrapolates a day's water weight into "-3%/wk". The span rule is
// what stops the report from inventing that number.
test('three entries inside a two-week window is not enough data either', () => {
  const t = bodyweightTrend(bwSeries([
    ['2026-01-01', 80.4], ['2026-01-02', 79.9], ['2026-01-03', 79.6],
  ]));
  assert.equal(t.enough, false);
  assert.equal(t.perWeek, null);
});

test('exactly three entries spanning exactly fourteen days is enough', () => {
  const t = bodyweightTrend(bwSeries([
    ['2026-01-01', 80], ['2026-01-09', 79.5], ['2026-01-15', 79],
  ]));
  assert.equal(t.enough, true);
});

test('a rising bodyweight gives a positive slope', () => {
  const t = bodyweightTrend(bwSeries([
    ['2026-01-01', 70], ['2026-01-15', 70.7], ['2026-01-29', 71.4],
  ]));
  assert.ok(t.perWeek > 0);
  assert.ok(t.pctPerWeek > 0);
});

test('the trend reports the period mean, which the absolute tolerance needs', () => {
  const t = bodyweightTrend(bwSeries([
    ['2026-01-01', 80], ['2026-01-08', 79], ['2026-01-15', 78],
  ]));
  assert.equal(t.mean, 79);
});

// Verdicts, checked in order: on track, wrong direction, faster, slower.
const trendOf = (pctPerWeek, perWeek = pctPerWeek, mean = 100) =>
  ({ enough: true, pctPerWeek, perWeek, mean });

test('a trend within tolerance of a percent target is on track', () => {
  assert.equal(rateVerdict(trendOf(-0.52), { kind: 'pct', value: -0.5 }), 'on track');
  assert.equal(rateVerdict(trendOf(-0.5), { kind: 'pct', value: -0.5 }), 'on track');
});

test('losing much faster than the target says so', () => {
  assert.equal(rateVerdict(trendOf(-1.4), { kind: 'pct', value: -0.5 }), 'faster than target');
});

test('barely losing against a loss target is slower, not wrong direction', () => {
  assert.equal(rateVerdict(trendOf(-0.1), { kind: 'pct', value: -0.5 }), 'slower than target');
  // A flat trend has no sign to oppose the target with.
  assert.equal(rateVerdict(trendOf(0), { kind: 'pct', value: -0.5 }), 'slower than target');
});

test('gaining while the target is a loss is the wrong direction', () => {
  assert.equal(rateVerdict(trendOf(0.4), { kind: 'pct', value: -0.5 }), 'wrong direction');
});

// A maintenance phase can carry 0%/wk, and zero has no sign to oppose.
test('any drift beyond tolerance of a zero target is faster, never wrong direction', () => {
  assert.equal(rateVerdict(trendOf(0.05), { kind: 'pct', value: 0 }), 'on track');
  assert.equal(rateVerdict(trendOf(-0.6), { kind: 'pct', value: 0 }), 'faster than target');
  assert.equal(rateVerdict(trendOf(0.6), { kind: 'pct', value: 0 }), 'faster than target');
});

test('an absolute target is compared in its own scale, with a scaled tolerance', () => {
  // tolerance = 0.0015 * 80 = 0.12 kg/wk
  assert.equal(rateVerdict(trendOf(-0.5, -0.42, 80), { kind: 'abs', value: -0.4, units: 'kg' }), 'on track');
  assert.equal(rateVerdict(trendOf(-1.2, -0.95, 80), { kind: 'abs', value: -0.4, units: 'kg' }), 'faster than target');
});

test('no verdict without a parsed target or without enough data', () => {
  assert.equal(rateVerdict(trendOf(-0.5), null), null);
  assert.equal(rateVerdict({ enough: false, pctPerWeek: null, perWeek: null, mean: null }, { kind: 'pct', value: -0.5 }), null);
});

const cardio = (rpe = null, zone = null) => ({ modality: 'Бег', minutes: 30, rpe, zone });

test('cardio intensity reads the unambiguous ends of both scales', () => {
  assert.equal(cardioIntensity(cardio(null, 2)), 'easy');
  assert.equal(cardioIntensity(cardio(null, 5)), 'hard');
  assert.equal(cardioIntensity(cardio(3)), 'easy');
  assert.equal(cardioIntensity(cardio(9)), 'hard');
});

test('cardio with neither RPE nor zone has no intensity, rather than a guess', () => {
  assert.equal(cardioIntensity(cardio()), null);
});

test('cardio doubts resolve towards hard: Z3 tempo and RPE 7 are hard, RPE 6 is not', () => {
  assert.equal(cardioIntensity(cardio(null, 3)), 'hard');
  assert.equal(cardioIntensity(cardio(7)), 'hard');
  assert.equal(cardioIntensity(cardio(6.5)), 'easy');
});

test('when RPE and zone disagree, the heavier of the two wins', () => {
  assert.equal(cardioIntensity(cardio(8, 2)), 'hard');
  assert.equal(cardioIntensity(cardio(4, 4)), 'hard');
});

test('a long cardio session is hard whatever its zone, even unrated', () => {
  const long = (rpe, zone) => ({ ...cardio(rpe, zone), minutes: 90 });
  assert.equal(cardioIntensity(long(null, 2)), 'hard');
  assert.equal(cardioIntensity(long(null, null)), 'hard');
  assert.equal(cardioIntensity({ ...cardio(null, 2), minutes: 89 }), 'easy');
});

// Rep records: for each rep count 1..12, the heaviest load
// lifted for at least that many reps — 100x5 also stands as a 3-rep best.
const bw = (reps) => ({ load: null, bw: true, bwOffset: 0, reps, rpe: null });
const repHistory = [
  { date: '2026-01-01', sets: [set(100, 5), set(100, 5)] },
  { date: '2026-01-08', sets: [set(110, 3), set(90, 8), bw(15)] },
  { date: '2026-01-15', sets: [set(115, 3)] },
  { date: '2026-01-22', sets: [set(115, 2)] },
];

test('a rep record is the heaviest load for at least that many reps', () => {
  const byReps = Object.fromEntries(repRecords(repHistory).map((r) => [r.reps, r]));
  assert.deepEqual(byReps[3], { reps: 3, load: 115, date: '2026-01-15', previous: 110 });
  assert.deepEqual(byReps[5], { reps: 5, load: 100, date: '2026-01-01', previous: null });
  assert.deepEqual(byReps[8], { reps: 8, load: 90, date: '2026-01-08', previous: null });
});

test('matching a rep record is not beating it, and rep counts never reached are absent', () => {
  const records = repRecords(repHistory);
  assert.equal(records.find((r) => r.reps === 1).date, '2026-01-15', 'a later 115 only equals the record');
  assert.deepEqual(records.map((r) => r.reps), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('bodyweight sets carry no load and set no rep record', () => {
  assert.deepEqual(repRecords([{ date: '2026-01-01', sets: [bw(10)] }]), []);
});
