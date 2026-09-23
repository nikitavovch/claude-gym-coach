// Parses athletes/<id>/phases.md: a markdown table of nutrition
// phases, newest row first. Mirrors exercises.mjs's parseExerciseTable — a
// pure text-in, structured-out parser with no filesystem access, so
// malformed input can be tested directly without touching disk.

export const VALID_PHASES = ['cut', 'bulk', 'maintain'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// The table has no other content — these two lines are the
// whole header, reused verbatim both when parsing (to recognize where data
// rows start) and when a write needs to create the file from nothing.
export const PHASE_TABLE_HEADER = '| From | To | Phase | Target rate | Note |\n|---|---|---|---|---|';

function splitRow(trimmed) {
  return trimmed
    .slice(1, trimmed.endsWith('|') ? -1 : undefined)
    .split('|')
    .map((c) => c.trim());
}

// Renders one row back to its markdown line. Used by data.mjs's setPhase()
// to write a freshly-closed row or a freshly-opened one — always from the
// row's own already-validated fields, never by patching substrings of the
// original line, so the output is always a well-formed row regardless of
// how the original was spaced.
export function formatPhaseRow(row) {
  return `| ${row.from} | ${row.to ?? ''} | ${row.phase} | ${row.targetRate ?? ''} | ${row.note ?? ''} |`;
}

// Parses the table into rows plus warnings. A malformed row (bad date,
// unknown phase, To before From) is dropped and produces one warning naming
// the row — the same "warn and keep going" contract as broken log files
// (parse-log.mjs), never a thrown error. Cross-row problems — more than one
// open phase (empty "To"), or two rows whose date ranges overlap — are
// detected afterwards, once every well-formed row is known. Each surviving
// row also carries `line`, its 0-indexed position in `text.split(/\r?\n/)`,
// so a caller that needs to edit the file in place (setPhase, in data.mjs)
// can replace exactly that line without touching anything else — no
// re-rendering of rows it didn't need to change.
export function parsePhaseTable(text) {
  const rows = [];
  const warnings = [];
  let rowNum = 0;
  const lines = text.split(/\r?\n/);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    if (/^\|[\s:|-]+\|$/.test(trimmed)) continue; // header separator row

    const cells = splitRow(trimmed);
    if (cells.length < 5) continue;
    if (/^from$/i.test(cells[0])) continue; // header row

    rowNum += 1;
    const [from, to, phaseName, targetRate, note] = cells;

    if (!DATE_RE.test(from)) {
      warnings.push(`phases.md row ${rowNum}: "From" date "${from}" is not YYYY-MM-DD`);
      continue;
    }
    if (to && !DATE_RE.test(to)) {
      warnings.push(`phases.md row ${rowNum}: "To" date "${to}" is not YYYY-MM-DD`);
      continue;
    }
    if (to && to < from) {
      warnings.push(`phases.md row ${rowNum}: "To" ${to} is before "From" ${from}`);
      continue;
    }
    if (!VALID_PHASES.includes(phaseName)) {
      warnings.push(`phases.md row ${rowNum}: unknown phase "${phaseName}" (expected cut, bulk or maintain)`);
      continue;
    }

    rows.push({
      row: rowNum,
      line: lineIndex,
      from,
      to: to || null,
      phase: phaseName,
      targetRate: targetRate || null,
      note: note || null,
    });
  }

  const openRows = rows.filter((r) => r.to === null);
  if (openRows.length > 1) {
    for (const r of openRows.slice(1)) {
      warnings.push(`phases.md row ${r.row}: more than one open phase (already open at row ${openRows[0].row})`);
    }
  }

  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const a = rows[i];
      const b = rows[j];
      if (a.to === null && b.to === null) continue; // already reported above
      const aEnd = a.to ?? '9999-12-31';
      const bEnd = b.to ?? '9999-12-31';
      if (a.from <= bEnd && b.from <= aEnd) {
        warnings.push(`phases.md rows ${a.row} and ${b.row} overlap`);
      }
    }
  }

  return { rows, warnings };
}
