import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { parseLogFile } from './parse-log.mjs';
import { parseExerciseTable } from './exercises.mjs';
import { parsePhaseTable, formatPhaseRow, PHASE_TABLE_HEADER, VALID_PHASES } from './phases.mjs';

export class CoachError extends Error {}

const SCHEMA = 1;
export const ATHLETE_ID = /^[a-z0-9][a-z0-9_-]*$/;

export function loadConfig(dir) {
  const path = join(dir, '.coach.json');
  if (!existsSync(path)) {
    throw new CoachError('this folder is not a coach data folder — run /coach:init');
  }

  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new CoachError(`.coach.json is not valid JSON: ${e.message}`);
  }

  if (raw.schema !== SCHEMA) {
    throw new CoachError(`data schema ${raw.schema} is not supported (expected ${SCHEMA}) — update the plugin or the data`);
  }

  // A default nobody is registered under would send every command without
  // --athlete to an empty history — "no sessions logged", exit 0.
  if (raw.default_athlete && !Object.hasOwn(raw.athletes ?? {}, raw.default_athlete)) {
    throw new CoachError(`default_athlete "${raw.default_athlete}" in .coach.json is not one of: ${Object.keys(raw.athletes ?? {}).join(', ') || '(none)'}`);
  }

  // Every id becomes a path segment (athletes/<id>/...), so the slug init
  // asks for is enforced here, before any path is built from it.
  for (const id of Object.keys(raw.athletes ?? {})) {
    if (!ATHLETE_ID.test(id)) {
      throw new CoachError(`athlete id "${id}" in .coach.json must be lowercase latin letters, digits, "-" or "_"`);
    }
  }

  return {
    schema: raw.schema,
    units: raw.units ?? 'kg',
    language: raw.language ?? 'en',
    defaultAthlete: raw.default_athlete ?? Object.keys(raw.athletes ?? {})[0] ?? null,
    athletes: raw.athletes ?? {},
  };
}

export function resolveAthlete(config, requested) {
  const ids = Object.keys(config.athletes);
  if (!ids.length) throw new CoachError('no athletes configured — run /coach:init');

  if (!requested) {
    if (!config.defaultAthlete) throw new CoachError(`no default athlete — pass one of: ${ids.join(', ')}`);
    return config.defaultAthlete;
  }

  const wanted = requested.toLowerCase();
  if (config.athletes[wanted]) return wanted;

  for (const [id, a] of Object.entries(config.athletes)) {
    if ((a.name ?? '').toLowerCase() === wanted) return id;
  }

  throw new CoachError(`unknown athlete "${requested}" — known: ${ids.join(', ')}`);
}

export function loadDb(dir) {
  const path = join(dir, 'exercises.md');
  if (!existsSync(path)) return { list: [], index: new Map(), missing: true };
  return parseExerciseTable(readFileSync(path, 'utf8'));
}

// --- Profile freshness ------------------------------------------------
//
// All four program specialists read profile.md — injuries, schedule,
// preferences, age — as current fact, and nothing outside `init` ever asks
// again. An athlete who starts a deficit and never edits their profile
// gets reviews that ignore it.
//
// The code cannot know whether a profile is still true. It can say when
// anyone last confirmed it, from a `## Checked` section (`## Проверено` in
// the Russian template) holding one dated line per confirmation. A missing
// file, a missing section and a long-stale date all mean the same thing to
// the caller — ask — but are reported apart, because "never written" and
// "written and never revisited" are different conversations.
const PROFILE_STALE_WEEKS = 8;
const CHECKED_HEADING = /^##\s+(checked|проверено)\s*$/i;

export function profileFreshness(dir, id, today) {
  const path = join(dir, 'athletes', id, 'profile.md');
  if (!existsSync(path)) {
    return { exists: false, lastChecked: null, weeksAgo: null, stale: true };
  }

  let inSection = false;
  let latest = null;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (/^##\s+/.test(line)) {
      inSection = CHECKED_HEADING.test(line.trim());
      continue;
    }
    if (!inSection) continue;
    // The dash is optional — the templates' own example has none — and a
    // date that isn't a real day, or lies after today, is a typo, not a
    // confirmation that keeps the profile fresh for ever.
    const m = /^(?:[-*]\s*)?(\d{4}-\d{2}-\d{2})\b/.exec(line.trim());
    if (!m || !isRealDate(m[1]) || m[1] > today) continue;
    if (latest === null || m[1] > latest) latest = m[1];
  }

  if (!latest) return { exists: true, lastChecked: null, weeksAgo: null, stale: true };

  const weeksAgo = Math.floor((Date.parse(today) - Date.parse(latest)) / (86400000 * 7));
  return { exists: true, lastChecked: latest, weeksAgo, stale: weeksAgo >= PROFILE_STALE_WEEKS };
}

// --- Target rate ---------------------------------------------
//
// `phase set --rate` stores whatever the athlete said, so a target may be
// "полкило в неделю". Only these two shapes can be compared against a
// measured trend; anything else returns null and the caller prints the
// target as written, without a verdict. Guessing at free text is the same
// as inventing a number.
const RATE_PERIOD = String.raw`(?:wk|week|нед|неделю)`;
const RATE_PCT = new RegExp(String.raw`^([+-]?\d+(?:[.,]\d+)?)\s*%\s*/\s*${RATE_PERIOD}$`, 'i');
const RATE_ABS = new RegExp(String.raw`^([+-]?\d+(?:[.,]\d+)?)\s*(kg|lb|кг)\s*/\s*${RATE_PERIOD}$`, 'i');

export function parseTargetRate(text) {
  if (typeof text !== 'string') return null;
  const t = text.trim();

  // A non-zero rate must carry its sign: "0.5%/wk" on a cut
  // read as a gain and judged a textbook cut "wrong direction".
  const signed = (s) => /^[+-]/.test(s) || Number(s.replace(',', '.')) === 0;

  const pct = RATE_PCT.exec(t);
  if (pct) return signed(pct[1]) ? { kind: 'pct', value: Number(pct[1].replace(',', '.')) } : null;

  const abs = RATE_ABS.exec(t);
  if (abs) {
    if (!signed(abs[1])) return null;
    const units = abs[2].toLowerCase() === 'кг' ? 'kg' : abs[2].toLowerCase();
    return { kind: 'abs', value: Number(abs[1].replace(',', '.')), units };
  }
  return null;
}

export function loadAthlete(dir, id, config) {
  const meta = config.athletes[id] ?? {};
  const logDir = join(dir, 'athletes', id, 'log');
  const days = [];
  const warnings = [];

  if (existsSync(logDir)) {
    const files = readdirSync(logDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort();
    for (const file of files) {
      const day = parseLogFile(readFileSync(join(logDir, file), 'utf8'), file);
      // A broken frontmatter or date loses the day; an unreadable line only
      // loses that line — one typo used to take a whole session out of
      // every record, trend and volume count.
      const fatal = day.errors.filter((e) => !/^line \d+:/.test(e));
      if (fatal.length) {
        warnings.push(`${id}/log/${file}: ${day.errors.join('; ')}`);
        continue;
      }
      for (const e of day.errors) warnings.push(`${id}/log/${file}: ${e} — that line is left out`);
      for (const w of day.warnings) warnings.push(`${id}/log/${file}: ${w}`);
      days.push({ ...day, file });
    }
  }

  return {
    id,
    name: meta.name ?? id,
    language: meta.language ?? config.language,
    // Per-athlete like the language: two people can share a folder and
    // train in different units. Nothing is converted — e1RM, trends and
    // stalls are ratios — so this is the label their own numbers carry.
    units: meta.units ?? config.units,
    daysPerWeek: meta.days_per_week ?? null,
    gym: meta.gym ?? 'shared',
    motivation: meta.motivation ?? false,
    days,
    warnings,
  };
}

// --- Nutrition phases -------------------------------------------------
//
// A missing athletes/<id>/phases.md is not an error: it means "maintain,
// unknown start date" (most people never log phases at all). currentPhase()
// and phaseAt() both go through loadPhases(), so a malformed row, an
// overlapping pair, or more than one open phase surfaces as a warning that
// names the row rather than a crash — the loader keeps going, exactly like
// a broken log file.

function daysBetweenDates(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

function weeksBetween(from, to) {
  return Math.floor(daysBetweenDates(from, to) / 7);
}

export function loadPhases(dir, id) {
  const path = join(dir, 'athletes', id, 'phases.md');
  if (!existsSync(path)) return { rows: [], warnings: [], hasFile: false };
  const { rows, warnings } = parsePhaseTable(readFileSync(path, 'utf8'));
  return { rows, warnings, hasFile: true };
}

// `row` is a parsed phases.md row (or null when nothing applies) and `date`
// is the reference point "weeks running" is measured against — today for
// currentPhase(), the requested date for phaseAt().
function phaseResult(row, date, warnings, hasFile) {
  if (!row) {
    return { phase: 'maintain', from: null, weeks: null, targetRate: null, note: null, warnings, hasFile };
  }
  return {
    phase: row.phase,
    from: row.from,
    weeks: weeksBetween(row.from, date),
    targetRate: row.targetRate,
    note: row.note,
    warnings,
    hasFile,
  };
}

// The open phase (empty "To") regardless of whether its start date is
// before or after `today` — "current" means "the one still open", not "the
// one whose range contains today".
export function currentPhase(dir, id, today) {
  const { rows, warnings, hasFile } = loadPhases(dir, id);
  const open = rows.find((r) => r.to === null) ?? null;
  return phaseResult(open, today, warnings, hasFile);
}

// The phase whose [From, To] range covers `date` — for a closed row To is
// inclusive; for the open row there is no upper bound.
export function phaseAt(dir, id, date) {
  const { rows, warnings, hasFile } = loadPhases(dir, id);
  const covering = rows.find((r) => r.from <= date && (r.to === null || date <= r.to)) ?? null;
  return phaseResult(covering, date, warnings, hasFile);
}

// Every phase row that overlaps [from, to] (both inclusive), oldest first,
// each carrying how many of *the period's* days it covers — used by
// report(), which must describe what covered the whole period rather than
// just the instant it started: looking up only the phase at
// `from` can name a phase that covered a single day of a period some other
// phase covered for weeks. An athlete with no phases.md, or whose rows
// don't reach into this window at all, comes back with no segments —
// callers treat that the same as phaseAt()'s "maintain, unknown start".
export function phaseRange(dir, id, from, to) {
  const { rows, warnings, hasFile } = loadPhases(dir, id);
  const overlapping = rows
    .filter((r) => r.from <= to && (r.to === null || r.to >= from))
    .sort((a, b) => a.from.localeCompare(b.from));

  const segments = overlapping.map((r) => {
    const periodFrom = r.from < from ? from : r.from;
    const periodTo = r.to === null || r.to > to ? to : r.to;
    return {
      phase: r.phase,
      from: r.from,
      to: r.to,
      targetRate: r.targetRate,
      note: r.note,
      daysInPeriod: daysBetweenDates(periodFrom, periodTo) + 1,
    };
  });

  return { segments, warnings, hasFile };
}

// True only when `dateStr` both matches YYYY-MM-DD and names a real
// calendar date — "2026-02-30" and "2026-13-99" both pass the shape check
// but describe no day that exists. `Date` silently rolls an out-of-range
// field into the following month/year instead of rejecting it (2026-02-30
// becomes 2026-03-02), so the shape check alone lets a corrupt date reach
// disk; a round trip through the same UTC formatting `dayBefore` and
// `formatPhaseRow` use catches both that silent rollover and the outright
// unparseable case (Date leaves `getTime()` as NaN).
function isRealDate(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === dateStr;
}

// Throws a readable CoachError naming the offending value when `dateStr`
// isn't a real calendar date — the single check every date arriving from
// outside the process (--from, --at, the report period) must pass before
// it reaches any Date arithmetic, so a bad value is refused up front
// instead of surfacing later as a raw RangeError out of `dayBefore` or a
// silently wrong row in phases.md.
export function assertRealDate(dateStr, label) {
  if (!isRealDate(dateStr)) {
    throw new CoachError(`${label} "${dateStr}" is not a real YYYY-MM-DD date`);
  }
}

// The day immediately before `dateStr`, in UTC. Plain Date arithmetic
// (unlike parseSince's month math elsewhere in this file's neighbour
// commands.mjs) needs no month/year-boundary special-casing —
// setUTCDate() already rolls over correctly in both directions — but it
// gets its own named, tested function anyway: this project has already
// been bitten twice by date arithmetic done inline (a Cyrillic word
// boundary, then month arithmetic at the 31st), so a third one doesn't
// get to live unexported and untested inside a shell one-liner.
export function dayBefore(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// The line ending the file already uses, so a rewrite that only ever
// touches one or two lines (see the comment below) doesn't turn every
// *other* line's ending into the wrong one as a side effect of
// `split(/\r?\n/)` throwing away which one it was. A brand-new file always
// gets `\n` — there's no existing convention to preserve.
function lineEndingOf(text) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

// Closes the currently open phase (if any) and opens a new one, writing
// athletes/<id>/phases.md directly — the one write path in the whole
// script; everything else only reads. Stays narrow on purpose: no note, no
// parsing of `rate` (free text), and it only ever rewrites
// the one line it closes plus the one line it inserts — every other row in
// the file, however it's formatted, is left byte-for-byte as it was.
//
// `today`, when given, is the one point of comparison for refusing a start
// date that hasn't happened yet — a future `from` would print a negative
// "weeks running" everywhere else in the plugin. It's optional (not every
// caller has a meaningful "now" — the direct-call tests below don't) so
// its absence simply skips that one check rather than defaulting to the
// real clock, which would make those tests' fixed 2026 dates fail only on
// whichever days happen to be after them.
export function setPhase(dir, id, phaseName, from, rate = null, today = null) {
  if (!VALID_PHASES.includes(phaseName)) {
    throw new CoachError(`unknown phase "${phaseName}" (expected cut, bulk or maintain)`);
  }
  // The rate lands in a table cell: a "|" would split it into two columns
  // and a line break would end the row.
  if (rate !== null && /[|\r\n]/.test(rate)) {
    throw new CoachError(`--rate "${rate}" holds "|" or a line break, which the phases table cannot store — rephrase without it`);
  }
  assertRealDate(from, '--from');
  if (today && from > today) {
    throw new CoachError(`--from ${from} is in the future (today is ${today})`);
  }

  const path = join(dir, 'athletes', id, 'phases.md');
  const exists = existsSync(path);
  const text = exists ? readFileSync(path, 'utf8') : '';
  const eol = exists ? lineEndingOf(text) : '\n';
  const { rows, warnings: unreadable } = exists ? parsePhaseTable(text) : { rows: [], warnings: [] };
  // A row the parser rejects could be the open phase; writing around it
  // would leave two phases open, or close the wrong one, silently.
  if (unreadable.length) {
    throw new CoachError(`phases.md has rows that cannot be read — fix them before changing phase: ${unreadable.join('; ')}`);
  }
  const open = rows.find((r) => r.to === null) ?? null;

  if (open && open.phase === phaseName && open.from === from) {
    return { action: 'noop', phase: phaseName, from: open.from };
  }

  // Same phase, different start date: this is a correction to *when the
  // open phase began*, not a new phase — closing it and opening a fresh
  // row (the old behaviour) would reset "weeks running" to zero and drop
  // whatever rate/note were already recorded on it, which is worse than
  // doing nothing. Only the From cell of the existing row changes; the
  // rate and note it already carries survive untouched, exactly like the
  // no-op case above leaves them untouched.
  if (open && open.phase === phaseName) {
    const previous = rows
      .filter((r) => r !== open && r.to !== null)
      .sort((a, b) => b.to.localeCompare(a.to))[0];
    if (previous && from <= previous.to) {
      throw new CoachError(`--from ${from} would overlap the ${previous.phase} that ran to ${previous.to} — correct that row first`);
    }
    const lines = text.split(/\r?\n/);
    lines[open.line] = formatPhaseRow({ ...open, from });
    writeFileSync(path, lines.join(eol));
    return { action: 'corrected', phase: phaseName, from, targetRate: open.targetRate, note: open.note };
  }

  // Same start date, different phase: the row was mislabeled, not
  // long-running under the wrong name — replace it in place rather than
  // closing it and opening a new one. This is safe regardless of how long
  // the row has been open, because the date itself doesn't move; what made
  // the old close-and-open behaviour dangerous was destroying a phase that
  // started in the *past*, and replacing a same-dated row can never do
  // that — at most it loses that one row's own rate/note, never any
  // history. Never silent: the caller gets back which phase was replaced
  // so it can say so.
  if (open && open.from === from) {
    const replaced = open.phase;
    const newRow = { from, to: null, phase: phaseName, targetRate: rate || null, note: null };
    const lines = text.split(/\r?\n/);
    lines[open.line] = formatPhaseRow(newRow);
    writeFileSync(path, lines.join(eol));
    return { action: 'replaced', replaced, phase: phaseName, from, targetRate: rate || null };
  }

  // Only a start date strictly *before* the open row's own start is
  // refused — closing it at dayBefore(from) would set that earlier row's
  // To before its own From, and (further back) would destroy however much
  // real history it already carries. Equal dates are handled above, as a
  // replacement, not refused.
  if (open && from < open.from) {
    throw new CoachError(
      `--from ${from} must be after the open phase's start ${open.from} — it would leave that phase a negative-length row`
    );
  }

  const newRow = { from, to: null, phase: phaseName, targetRate: rate || null, note: null };
  let closedPrevious = null;

  if (open) {
    const closeDate = dayBefore(from);
    closedPrevious = { phase: open.phase, from: open.from, to: closeDate };
    const lines = text.split(/\r?\n/);
    lines[open.line] = formatPhaseRow({ ...open, to: closeDate });
    lines.splice(open.line, 0, formatPhaseRow(newRow));
    writeFileSync(path, lines.join(eol));
  } else if (exists) {
    // The file exists (rows may all be closed, or malformed) but nothing
    // is open — insert above the header separator's next line, leaving
    // every existing line exactly as it was; nothing to close.
    const lines = text.split(/\r?\n/);
    const separatorIndex = lines.findIndex((l) => /^\|[\s:|-]+\|$/.test(l.trim()));
    const insertAt = separatorIndex === -1 ? lines.length : separatorIndex + 1;
    lines.splice(insertAt, 0, formatPhaseRow(newRow));
    writeFileSync(path, lines.join(eol));
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${PHASE_TABLE_HEADER}\n${formatPhaseRow(newRow)}\n`);
  }

  return { action: 'opened', phase: phaseName, from, targetRate: rate || null, closedPrevious };
}
