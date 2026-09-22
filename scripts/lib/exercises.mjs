export function normalizeName(s) {
  return s
    .replace(/ё/gi, (c) => (c === 'Ё' ? 'Е' : 'е'))
    .toLowerCase()
    .replace(/[.,;:!]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitList(cell) {
  return cell
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseExerciseTable(text) {
  const list = [];
  const index = new Map();

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    if (/^\|[\s:|-]+\|$/.test(trimmed)) continue;

    const cells = trimmed.slice(1, trimmed.endsWith('|') ? -1 : undefined).split('|').map((c) => c.trim());
    if (cells.length < 5) continue;
    if (/^exercise$/i.test(cells[0])) continue;

    const exercise = {
      canonical: cells[0],
      aliases: splitList(cells[1]),
      equipment: splitList(cells[2]),
      muscles: splitList(cells[3]),
      main: /^yes$/i.test(cells[4]),
    };

    list.push(exercise);
    index.set(normalizeName(exercise.canonical), exercise);
    for (const alias of exercise.aliases) {
      const key = normalizeName(alias);
      if (!index.has(key)) index.set(key, exercise);
    }
  }

  return { list, index };
}

export function resolveExercise(name, db) {
  return db.index.get(normalizeName(name)) ?? null;
}

// --- Writing the athlete's own table (/coach:exercise) ---------------------
//
// Both functions take the file's text and return the new text, or an
// { error } that says what to fix. They refuse any name the table already
// answers to: the index is first-come for aliases, but a canonical name
// always takes its key, so one careless row could quietly move "становая"
// — and every deadlift ever logged under it — to a different exercise.

const CUSTOM_HEADING = { ru: '## Свои упражнения', en: '## Custom exercises' };
const TABLE_HEAD = ['| Exercise | Aliases | Equipment | Muscles | Main |', '|---|---|---|---|---|'];

function cleanList(values) {
  return (values ?? []).map((s) => String(s).trim()).filter(Boolean);
}

function delimiterError(label, value) {
  for (const ch of ['|', ';']) {
    if (value.includes(ch)) return `${label} "${value}" holds "${ch}", which the table uses as a delimiter`;
  }
  // A name goes back onto command lines, inside double quotes, every time
  // it is logged. Keeping these out of the table is what makes any name
  // from it safe there; an apostrophe ("Farmer's Carry") is harmless.
  for (const ch of ['"', '`', '$', '\\']) {
    if (value.includes(ch)) return `${label} "${value}" holds "${ch}", which a shell would act on — rephrase without it`;
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) return `${label} holds a control character — keep it to one plain line`;
  return null;
}

// Every name must be free in the table.
function nameError(index, names) {
  for (const n of names) {
    const owner = index.get(normalizeName(n));
    if (owner) return `"${n}" already names ${owner.canonical}`;
  }
  return null;
}

// One spelling per key. The shipped tables repeat the canonical name as the
// first alias, so an alias equal to the name stays — only repeats go.
function uniqueAliases(aliases) {
  const seen = new Set();
  return aliases.filter((a) => {
    const key = normalizeName(a);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const rowLine = (cells) => `| ${cells.join(' | ')} |`;
const eolOf = (text) => (text.includes('\r\n') ? '\r\n' : '\n');

export function addExerciseRow(text, spec, lang = 'en') {
  const { list, index } = parseExerciseTable(text);
  const name = String(spec.name ?? '').trim();
  const aliases = uniqueAliases(cleanList(spec.aliases));
  const equipment = cleanList(spec.equipment);
  const muscles = cleanList(spec.muscles);

  if (!name) return { error: 'a new exercise needs a name' };
  for (const [label, values] of [['name', [name]], ['alias', aliases], ['equipment', equipment], ['muscle', muscles]]) {
    for (const v of values) {
      const error = delimiterError(label, v);
      if (error) return { error };
    }
  }
  const taken = nameError(index, [name, ...aliases]);
  if (taken) return { error: taken };
  if (!equipment.length) return { error: 'a new exercise needs its equipment' };
  if (!muscles.length) return { error: 'a new exercise needs at least its primary muscle' };

  // The table's own vocabulary: a muscle it has never used would open a
  // new row in report's weekly volume, split off by a typo.
  const knownMuscles = new Set(list.flatMap((e) => e.muscles));
  const knownEquipment = new Set(list.flatMap((e) => e.equipment));
  for (const m of muscles) {
    if (!knownMuscles.has(m)) return { error: `unknown muscle "${m}" — the table uses: ${[...knownMuscles].sort().join(', ')}` };
  }
  for (const e of equipment) {
    if (!knownEquipment.has(e) && !/^machine:[a-z0-9-]+$/.test(e)) {
      return { error: `unknown equipment "${e}" — the table uses: ${[...knownEquipment].sort().join(', ')}, or machine:<name>` };
    }
  }

  const row = rowLine([name, aliases.join('; '), equipment.join('; '), muscles.join('; '), spec.main ? 'yes' : 'no']);
  const eol = eolOf(text);
  const heading = CUSTOM_HEADING[lang] ?? CUSTOM_HEADING.en;
  const lines = text.replace(/\s+$/, '').split(/\r?\n/);
  const at = lines.findIndex((l) => l.trim() === heading);

  if (at === -1) {
    lines.push('', heading, '', ...TABLE_HEAD, row);
  } else {
    let end = lines.length;
    for (let i = at + 1; i < lines.length; i += 1) {
      if (/^##\s/.test(lines[i])) { end = i; break; }
    }
    let lastRow = -1;
    for (let i = at + 1; i < end; i += 1) if (lines[i].trim().startsWith('|')) lastRow = i;
    if (lastRow === -1) lines.splice(at + 1, 0, '', ...TABLE_HEAD, row);
    else lines.splice(lastRow + 1, 0, row);
  }

  return {
    text: lines.join(eol) + eol,
    row: { canonical: name, aliases, equipment, muscles, main: Boolean(spec.main) },
  };
}

export function addAliases(text, target, newAliases) {
  const { index } = parseExerciseTable(text);
  const aliases = uniqueAliases(cleanList(newAliases));
  if (!aliases.length) return { error: 'give at least one alias to add' };
  const owner = index.get(normalizeName(String(target ?? '')));
  if (!owner) return { error: `no exercise answers to "${target}"` };
  for (const a of aliases) {
    const error = delimiterError('alias', a);
    if (error) return { error };
  }
  const taken = nameError(index, aliases);
  if (taken) return { error: taken };

  const eol = eolOf(text);
  const lines = text.split(/\r?\n/);
  const i = lines.findIndex((l) => {
    const t = l.trim();
    return t.startsWith('|') && t.slice(1).split('|')[0].trim() === owner.canonical;
  });
  const trimmed = lines[i].trim();
  const cells = trimmed.slice(1, trimmed.endsWith('|') ? -1 : undefined).split('|').map((c) => c.trim());
  cells[1] = [...splitList(cells[1]), ...aliases].join('; ');
  lines[i] = rowLine(cells);

  return { text: lines.join(eol), canonical: owner.canonical, added: aliases };
}

const COLUMN_COUNT = 11;

/** Split a comma-separated list cell (knowledge/exercises.md's delimiter — the
 *  five-column template tables above use semicolons and their own splitter). */
function splitCommaList(cell) {
  return cell
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== '—' && s !== '-');
}

/**
 * Parse the eleven-column "Exercise database" table (section 6) out of
 * knowledge/exercises.md. Ignores every other section (prose, the
 * fractional-volume table in §7, substitution groups in §8, alias notes in
 * §9) by only reading table rows between the "## 6." and "## 7." headings.
 */
export function parseKnowledgeTable(text, source = 'knowledge/exercises.md') {
  const rows = [];
  let inTable = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (/^##\s+6\./.test(line)) {
      inTable = true;
      continue;
    }
    if (/^##\s+7\./.test(line)) {
      inTable = false;
      continue;
    }
    if (!inTable) continue;

    if (!line.startsWith('|')) continue;
    if (/^\|[\s:|-]+\|$/.test(line)) continue; // separator row

    const cells = line
      .slice(1, line.endsWith('|') ? -1 : undefined)
      .split('|')
      .map((c) => c.trim());

    // A well-formed row has exactly COLUMN_COUNT cells. Fewer means a
    // missing "|"; more means an unescaped "|" inside a cell's own text,
    // which silently shifts every later column into the wrong field. Either
    // way, guessing at the intended shape and pressing on would emit a
    // table that reads as valid but carries wrong data (or drops the row
    // outright) — the README tells users to hand-edit this file, so a typo
    // must fail loudly here, not surface downstream as a bad exercise row.
    if (cells.length !== COLUMN_COUNT) {
      throw new Error(
        `Malformed exercise row in ${source}: expected ${COLUMN_COUNT} columns, got ${cells.length} `
        + `(check for a stray or missing "|", including an unescaped "|" inside a cell's own text):\n${rawLine}`,
      );
    }

    if (/^Exercise EN$/i.test(cells[0])) continue; // header row

    if (!cells[6]) {
      throw new Error(`Exercise row in ${source} has an empty primary-muscle cell:\n${rawLine}`);
    }

    rows.push({
      exerciseEn: cells[0],
      exerciseRu: cells[1],
      aliasesEn: splitCommaList(cells[2]),
      aliasesRu: splitCommaList(cells[3]),
      equipment: splitCommaList(cells[4]),
      pattern: cells[5],
      primaryMuscle: cells[6],
      secondaryMuscles: splitCommaList(cells[7]),
      main: /^yes$/i.test(cells[8]),
      loadType: cells[9],
      substitutes: splitCommaList(cells[10]),
    });
  }

  return rows;
}

/**
 * Build the five-column rows for one language.
 * `canonicalName`/`canonicalAliases` pick which language is the canonical
 * column; the other language's name is appended to the alias list, after
 * that language's own aliases.
 */
