// Loads the gym can actually build. The weight on the bar is the number an
// athlete acts on at the gym door, so it is computed here from the gym's own
// plates — never rounded in a prompt. gym.md stays prose for the model; the
// few lines below are what this module reads from it:
//
//   - bar: 20                      (гриф: 20)
//   - plates: 25, 20, 15, 10, 5, 2.5, 1.25   (блины: …; pairs, any count)
//   - dumbbells: 2–40 step 2       (гантели: 2–40 шаг 2)
//
// Plate counts are not modelled: a listed plate is assumed to exist in
// pairs, as in any commercial gym.

const NUMBER = String.raw`\d+(?:[.,]\d+)?`;
const num = (s) => Number(String(s).trim().replace(',', '.'));
const cents = (v) => Math.round(v * 100);

export function parseGymLoads(text) {
  let bar = null;
  let plates = [];
  let dumbbells = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    let m = new RegExp(String.raw`^[-*]\s*(?:bar|гриф)\s*:\s*(${NUMBER})\s*(?:kg|lb|кг)?\s*$`, 'i').exec(line);
    if (m) {
      bar = num(m[1]);
      continue;
    }
    m = /^[-*]\s*(?:plates|блины)\s*:\s*(.+)$/i.exec(line);
    if (m) {
      // ", " separates plates; a comma with no space is a decimal comma.
      plates = m[1]
        .split(/\s*;\s*|,\s+/)
        .map((s) => s.trim().replace(/\s*(kg|lb|кг)$/i, ''))
        .filter((s) => new RegExp(`^${NUMBER}$`).test(s))
        .map(num)
        .filter((v) => v > 0);
      plates = [...new Set(plates)].sort((a, b) => b - a);
      continue;
    }
    m = new RegExp(String.raw`^[-*]\s*(?:dumbbells|гантели)\s*:\s*(${NUMBER})\s*[-–—]\s*(${NUMBER})\s*(?:kg|lb|кг)?\s*,?\s*(?:step|шаг)\s*(${NUMBER})`, 'i').exec(line);
    if (m) dumbbells = { min: num(m[1]), max: num(m[2]), step: num(m[3]) };
  }

  return { bar, plates, dumbbells };
}

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

// The plates for one side, heaviest first. Greedy is exact for the usual
// denominations; a small search covers a set where it is not.
function platesFor(sideCents, plateCents) {
  const greedy = [];
  let left = sideCents;
  for (const p of plateCents) {
    while (left >= p) {
      greedy.push(p);
      left -= p;
    }
  }
  if (left === 0) return greedy;

  const best = new Array(sideCents + 1).fill(null);
  best[0] = [];
  for (let v = 1; v <= sideCents; v += 1) {
    for (const p of plateCents) {
      if (p <= v && best[v - p] && (!best[v] || best[v - p].length + 1 < best[v].length)) {
        best[v] = [...best[v - p], p];
      }
    }
  }
  return best[sideCents] ? best[sideCents].sort((a, b) => b - a) : null;
}

export function nearestBarbell(target, gym) {
  if (!gym?.bar || !gym.plates?.length) return null;
  const barC = cents(gym.bar);
  const plateC = gym.plates.map(cents);
  const unit = plateC.reduce((g, p) => gcd(g, p));
  const step = 2 * unit;
  const targetC = cents(target);

  let loadC = barC;
  if (targetC > barC) {
    const lo = barC + Math.floor((targetC - barC) / step) * step;
    const hi = lo + step;
    // An exact tie rounds down — the planner's long-standing rule.
    loadC = hi - targetC < targetC - lo ? hi : lo;
  }
  const side = platesFor((loadC - barC) / 2, plateC);
  return { load: loadC / 100, perSide: (side ?? []).map((p) => p / 100) };
}

export function nearestDumbbell(target, gym) {
  const d = gym?.dumbbells;
  if (!d) return null;
  const minC = cents(d.min);
  const maxC = cents(d.max);
  const stepC = cents(d.step);
  const t = Math.min(Math.max(cents(target), minC), maxC);
  const lo = minC + Math.floor((t - minC) / stepC) * stepC;
  const hi = Math.min(lo + stepC, maxC);
  return (hi - t < t - lo ? hi : lo) / 100;
}

// knowledge/technique/_general.md §2: the percentages are the rule, the
// kilograms only illustrate them. Each step is rounded to what the bar can
// be loaded to; a step at or above the working weight, or one closer to the
// previous than two pairs of the smallest plate, is dropped — so a light
// working set gets a short ramp on its own.
const LADDER = [
  [0.40, '5'],
  [0.55, '3'],
  [0.70, '2'],
  [0.82, '1–2'],
  [0.92, '1'],
];

export function warmupLadder(working, gym) {
  if (!gym?.bar || !gym.plates?.length || working <= gym.bar) return [];
  const minJump = 4 * Math.min(...gym.plates);
  const steps = [{ load: gym.bar, reps: '8–10', perSide: [] }];
  for (const [pct, reps] of LADDER) {
    const { load, perSide } = nearestBarbell(working * pct, gym);
    if (load >= working || load - steps.at(-1).load < minJump) continue;
    steps.push({ load, reps, perSide });
  }
  return steps;
}
