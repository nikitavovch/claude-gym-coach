import { parseExerciseLine } from './parse-sets.mjs';

const SECTION_ALIASES = {
  plan: ['plan', 'план'],
  actual: ['actual', 'факт'],
  cardio: ['cardio', 'кардио'],
  notes: ['notes', 'заметки'],
};

const REQUIRED = ['date', 'session', 'status'];
const STATUSES = ['planned', 'done', 'skipped'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function sectionKind(heading) {
  const h = heading.trim().toLowerCase();
  for (const [kind, aliases] of Object.entries(SECTION_ALIASES)) {
    if (aliases.includes(h)) return kind;
  }
  return null;
}

function splitFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return { fm: null, body: text, offset: 0 };
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
  if (end === -1) return { fm: null, body: text, offset: 0 };
  return {
    fm: lines.slice(1, end).join('\n'),
    body: lines.slice(end + 1).join('\n'),
    offset: end + 1,
  };
}

// A frontmatter number. Missing is null; a decimal comma is a decimal point
// (how a Russian athlete writes 83,1); anything else — blank, "83.1 kg", a
// word, or out of range — is null with a warning, never NaN and never 0.
function numberField(meta, key, warnings, min = -Infinity, max = Infinity) {
  if (meta[key] === undefined) return null;
  const raw = String(meta[key]).trim();
  const n = /^-?\d+(?:[.,]\d+)?$/.test(raw) ? Number(raw.replace(',', '.')) : NaN;
  if (!Number.isFinite(n)) {
    warnings.push(`${key} "${raw}" is not a number — ignored`);
    return null;
  }
  if (n < min || n > max) {
    warnings.push(`${key} "${raw}" is outside ${min}..${max} — ignored`);
    return null;
  }
  return n;
}

function parseFrontmatter(fm) {
  const out = {};
  for (const line of fm.split(/\r?\n/)) {
    const m = /^([a-z_]+)\s*:\s*(.*)$/i.exec(line.trim());
    if (m) out[m[1].toLowerCase()] = m[2].trim();
  }
  return out;
}

const CARDIO_RE =
  /^-\s*(.+?)\s+(\d+(?:\.\d+)?)\s*(?:мин|min)(?=[\s,]|$)\s*(?:@(\d{1,2}(?:\.5)?)|Z(\d))?\s*(?:,\s*([\d.]+\s*[a-zа-яё]+))?\s*(?:,\s*(\d{1,2}:\d{2}))?\s*(?:(?:—|--|–)\s*(.*))?$/i;

function parseCardioLine(line) {
  const m = CARDIO_RE.exec(line.trim());
  if (!m) return null;
  return {
    modality: m[1].trim(),
    minutes: Number(m[2]),
    rpe: m[3] === undefined ? null : Number(m[3]),
    zone: m[4] === undefined ? null : Number(m[4]),
    distance: m[5] ? m[5].replace(/\s+/g, '') : null,
    time: m[6] ?? null,
    note: m[7]?.trim() ?? null,
  };
}

export function parseLogFile(text, basename) {
  const errors = [];
  const warnings = [];
  const { fm, body, offset } = splitFrontmatter(text);

  if (fm === null) {
    errors.push('no frontmatter found');
  }

  const meta = fm === null ? {} : parseFrontmatter(fm);
  for (const key of REQUIRED) {
    if (!meta[key]) errors.push(`missing required frontmatter key "${key}"`);
  }

  const expectedDate = basename.replace(/\.md$/i, '');
  if (meta.date && !DATE_RE.test(meta.date)) {
    errors.push(`date "${meta.date}" is not YYYY-MM-DD`);
  } else if (meta.date && meta.date !== expectedDate) {
    errors.push(`date "${meta.date}" does not match the filename "${basename}"`);
  }

  if (meta.status && !STATUSES.includes(meta.status)) {
    errors.push(`unknown status "${meta.status}"`);
  }

  const feel = numberField(meta, 'feel', warnings, 1, 5);
  const durationMin = numberField(meta, 'duration_min', warnings, 1, 1440);
  const bodyweight = numberField(meta, 'bodyweight', warnings, 1, 1000);

  // Dictation turns a time into prose ("6pm", "вечером") more readily than
  // any other frontmatter field. Warn like `feel` rather than erroring:
  // an unreadable clock must not cost the athlete the session's sets.
  if (meta.time !== undefined && !TIME_RE.test(String(meta.time))) {
    warnings.push(`time "${meta.time}" is not HH:MM`);
  }

  const sections = { plan: [], actual: [], cardio: [], notes: [] };
  let current = null;

  const bodyLines = body.split(/\r?\n/);
  bodyLines.forEach((line, i) => {
    const heading = /^##\s+(.*)$/.exec(line);
    if (heading) {
      current = sectionKind(heading[1]);
      if (!current) warnings.push(`line ${offset + i + 1}: unknown section "${line.trim()}" — its lines are ignored`);
      return;
    }
    if (current) sections[current].push({ text: line, lineNo: offset + i + 1 });
  });

  const actual = [];
  // A line under Actual or Cardio that isn't a "- " item — "* ", "1. ", an
  // autocorrected dash — used to vanish without a word.
  const notAnItem = (line, lineNo) => {
    const t = line.trim();
    if (t && !t.startsWith('<!--')) warnings.push(`line ${lineNo}: "${t}" is not a "- " item and is ignored`);
  };

  for (const { text: line, lineNo } of sections.actual) {
    if (!line.trim().startsWith('- ')) {
      notAnItem(line, lineNo);
      continue;
    }
    const parsed = parseExerciseLine(line);
    if (!parsed) {
      errors.push(`line ${lineNo}: cannot parse exercise line "${line.trim()}"`);
      continue;
    }
    // A line with an unreadable set is left out whole: keeping the sets
    // around a typo would log a session that didn't happen as written.
    if (parsed.errors.length) {
      for (const e of parsed.errors) errors.push(`line ${lineNo}: ${e}`);
      continue;
    }
    actual.push({ name: parsed.name, sets: parsed.sets, note: parsed.note, miss: parsed.miss });
  }

  const cardio = [];
  for (const { text: line, lineNo } of sections.cardio) {
    if (!line.trim().startsWith('- ')) {
      notAnItem(line, lineNo);
      continue;
    }
    const parsed = parseCardioLine(line);
    if (parsed) cardio.push(parsed);
    else errors.push(`line ${lineNo}: cannot parse cardio line "${line.trim()}"`);
  }

  // A cardio-only day (a run on a rest day) is a closed session too; only
  // a done day with nothing at all in it is malformed.
  if (meta.status === 'done' && actual.length === 0 && cardio.length === 0) {
    errors.push('status is done but neither the actual nor the cardio section has an entry');
  }

  return {
    date: meta.date ?? null,
    session: meta.session ?? null,
    status: meta.status ?? null,
    durationMin,
    time: meta.time ?? null,
    feel,
    bodyweight,
    plan: sections.plan.map((l) => l.text).filter((l) => l.trim()),
    actual,
    cardio,
    notes: sections.notes.map((l) => l.text).join('\n').trim(),
    errors,
    warnings,
  };
}
