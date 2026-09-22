export function formatBrief(result) {
  const lines = [];

  for (const a of result.athletes) {
    const parts = [];
    if (a.last) {
      let ago;
      if (a.daysAgo < 0) ago = 'dated in the future';
      else if (a.daysAgo === 0) ago = 'today';
      else if (a.daysAgo === 1) ago = '1 day ago';
      else ago = `${a.daysAgo} days ago`;
      parts.push(`last ${a.last} (${a.lastSession}), ${ago}`);
    } else {
      parts.push('no workouts logged yet');
    }
    parts.push(`Logged ${a.total}`);

    if (a.todayStatus) parts.push(`Today ${result.today}: ${a.todayStatus}${a.todaySession ? ` (${a.todaySession})` : ''}`);
    else parts.push('Today: no file');

    if (a.openPlanned.length) parts.push(`Open planned: ${a.openPlanned.join(', ')}`);

    // Kept to a few words — the brief is injected every session, so a
    // multi-line phase readout here would pay a real token cost repeatedly.
    if (a.phase) parts.push(a.phase.weeks === null ? a.phase.phase : `${a.phase.phase} wk${a.phase.weeks}`);

    lines.push(`${a.id}: ${parts.join('. ')}.`);
    for (const w of a.warnings) lines.push(`  warning: ${w}`);
  }

  return lines.join('\n');
}

export function formatRecent(result) {
  const lines = result.rows.length
    ? result.rows.map((r) => `${r.date}  ${r.session ?? '-'}  ${r.status}${r.cardioOnly ? '  cardio only' : ''}`)
    : ['no sessions logged'];

  if (result.warnings?.length) {
    lines.push('', 'Warnings:');
    for (const w of result.warnings) lines.push(`  ${w}`);
  }

  return lines.join('\n');
}

export function formatValidate(result) {
  const lines = [];
  for (const f of result.files) {
    if (f.ok) {
      lines.push(`OK ${f.path} — ${f.exercises} exercises, ${f.sets} sets${f.cardio ? `, ${f.cardio} cardio` : ''}`);
    } else {
      lines.push(`FAIL ${f.path}`);
      for (const e of f.errors) lines.push(`  ERROR ${e}`);
    }
    for (const w of f.warnings) lines.push(`  WARN ${w}`);
  }
  return lines.join('\n');
}

// The athlete's own numbers, labelled with the athlete's own units.
// Nothing is converted on the way through: a log written in pounds
// reads back in pounds.
const weight = (v, units = 'kg') => (v === null ? '-' : `${Math.round(v * 10) / 10} ${units}`);

export function formatPhase(result) {
  const lines = [];

  if (result.from) {
    const weeksTxt = result.weeks === 1 ? '1 week' : `${result.weeks} weeks`;
    lines.push(`${result.phase}, started ${result.from}, ${weeksTxt} running${result.targetRate ? `, target ${result.targetRate}` : ''}`);
  } else {
    lines.push(`${result.phase}, start date unknown`);
  }

  if (result.warnings?.length) {
    lines.push('', 'Warnings:');
    for (const w of result.warnings) lines.push(`  ${w}`);
  }

  lines.push(...bodyweightLines(result.bodyweight, result.units));

  return lines.join('\n');
}

// "1: 140, 2–5: 120, 6–8: 100" — consecutive rep counts that share a load
// are one run, since a single set of five sets the 2- to 5-rep bests at
// once. The dates stay in --json.
function repRecordRuns(records) {
  if (!records?.length) return '';
  const runs = [];
  for (const r of records) {
    const last = runs.at(-1);
    if (last && last.load === r.load && last.to === r.reps - 1) last.to = r.reps;
    else runs.push({ from: r.reps, to: r.reps, load: r.load });
  }
  return runs
    .map((run) => `${run.from === run.to ? run.from : `${run.from}–${run.to}`}: ${Math.round(run.load * 10) / 10}`)
    .join(', ');
}

export function formatExercises(result) {
  const w = (v) => weight(v, result.units);
  const lines = [];

  for (const item of result.items) {
    const tags = [item.main ? '(main)' : null, item.known ? null : '(unknown exercise)'].filter(Boolean).join(' ');
    lines.push(`${item.canonical} ${tags}`.trim());

    if (!item.performances.length) {
      lines.push('  no history');
      continue;
    }

    const prLoad = item.prLoad === null && item.prAddedLoad ? `BW+${w(item.prAddedLoad)}` : w(item.prLoad);
    lines.push(`  PR load ${prLoad}; best e1RM ${w(item.prE1rm)}${item.prE1rmDate ? ` (${item.prE1rmDate})` : ''}; smoothed ${w(item.smoothed)}`);
    if (!item.rpeTrusted) {
      lines.push(item.hasRpeData
        ? '  RPE looks unreliable — progress by load and reps'
        : '  no RPE data logged — progress by load and reps');
    }
    const reps = repRecordRuns(item.repRecords);
    if (reps) lines.push(`  Rep records (${item.repRecords[0].bw ? 'BW+' : ''}${result.units}): ${reps}`);
    for (const p of item.performances) {
      lines.push(`  ${p.date}: ${p.sets}${p.miss ? ` (miss: ${p.miss})` : ''}${p.e1rm !== null ? ` → e1RM ${w(p.e1rm)}` : ''}${p.note ? ` — ${p.note}` : ''}`);
    }
  }

  if (result.warnings?.length) {
    lines.push('', 'Warnings:');
    for (const w of result.warnings) lines.push(`  ${w}`);
  }

  return lines.join('\n');
}

export function formatPhaseSet(result) {
  const warnings = (result.warnings ?? []).map((w) => `warning: ${w}`);
  return [phaseSetSummary(result), ...warnings].join('\n');
}

function phaseSetSummary(result) {
  if (result.action === 'noop') {
    return `already on ${result.phase}, since ${result.from} — nothing changed`;
  }

  if (result.action === 'corrected') {
    return `${result.phase} start date corrected to ${result.from}${result.targetRate ? `, target ${result.targetRate}` : ''} — rate and note unchanged`;
  }

  if (result.action === 'replaced') {
    return `replaced ${result.replaced}, opened ${result.from}, with ${result.phase}${result.targetRate ? `, target ${result.targetRate}` : ''}`;
  }

  const lines = [];
  if (result.closedPrevious) {
    const p = result.closedPrevious;
    lines.push(`closed ${p.phase} (started ${p.from}, through ${p.to})`);
  }
  lines.push(`opened ${result.phase}, started ${result.from}${result.targetRate ? `, target ${result.targetRate}` : ''}`);
  return lines.join('\n');
}

// One wording for the trend, shared by `phase` and `report`, so the same
// measurement never reads two different ways.
function bodyweightLines(bw, units) {
  if (!bw || !bw.trend.n) return [];
  const t = bw.trend;
  const lines = [];
  const rate = t.enough
    ? `${t.perWeek >= 0 ? '+' : ''}${Math.round(t.perWeek * 100) / 100} ${units}/wk (${t.pctPerWeek >= 0 ? '+' : ''}${Math.round(t.pctPerWeek * 100) / 100}%/wk)`
    : 'not enough data \u2014 3 entries over at least 14 days are needed';
  lines.push(`Bodyweight: ${t.n} ${t.n === 1 ? 'entry' : 'entries'}, ${t.first} \u2192 ${weight(t.last, units)}, ${rate}${bw.verdict ? ` \u2014 ${bw.verdict}` : ''}`);
  for (const flag of bw.flags) lines.push(`  Flag: ${flag}`);
  return lines;
}

export function formatCatalog(result) {
  const lines = [];
  const filters = [];
  if (result.filteredBy.equipment) filters.push(`equipment: ${result.filteredBy.equipment.join(', ')}`);
  if (result.filteredBy.main) filters.push('main lifts only');
  lines.push(`${result.exercises.length} of ${result.total} exercises${filters.length ? ` (${filters.join('; ')})` : ''}`, '');

  lines.push('| Exercise | Equipment | Pattern | Primary | Secondary | Main | Substitutes |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const e of result.exercises) {
    lines.push(`| ${e.name} | ${e.equipment.join(', ')} | ${e.pattern} | ${e.primaryMuscle} | ${e.secondaryMuscles.join(', ') || '—'} | ${e.main ? 'yes' : 'no'} | ${e.substitutes.join(', ') || '—'} |`);
  }
  return lines.join('\n');
}

export function formatBodyweight(result) {
  const w = (v) => weight(v, result.units);
  const t = result.trend;
  const lines = [`${result.athlete}, since ${result.since}`];

  if (!t.n) {
    lines.push('No bodyweight logged in this period.');
  } else {
    // The unit is stated once, on the value the athlete ends at.
    lines.push(`${t.n} ${t.n === 1 ? 'entry' : 'entries'}, ${t.from} \u2192 ${t.to}: ${t.first} \u2192 ${w(t.last)}`);
    lines.push(t.enough
      ? `Trend: ${t.perWeek >= 0 ? '+' : ''}${(Math.round(t.perWeek * 100) / 100)} ${result.units}/wk (${t.pctPerWeek >= 0 ? '+' : ''}${(Math.round(t.pctPerWeek * 100) / 100)}%/wk)`
      : 'Trend: not enough data \u2014 3 entries over at least 14 days are needed');
  }

  if (result.phase?.phase) {
    const target = result.phase.targetRate ? `, target ${result.phase.targetRate}` : '';
    lines.push(`Phase: ${result.phase.phase}${target}${result.verdict ? ` \u2014 ${result.verdict}` : ''}`);
  }

  for (const flag of result.flags) lines.push(`Flag: ${flag}`);

  if (result.warnings?.length) {
    lines.push('', 'Warnings:');
    for (const warn of result.warnings) lines.push(`  ${warn}`);
  }

  return lines.join('\n');
}

function cardioLines(cardio) {
  if (!cardio?.weeks.length) return [];
  const lines = ['', 'Cardio:'];
  for (const c of cardio.weeks) {
    const unrated = c.unrated ? `, ${c.unrated} unrated` : '';
    lines.push(`  ${c.week}: ${c.sessions} session${c.sessions === 1 ? '' : 's'}, ${c.minutes} min, ${c.hard} hard${unrated}`);
  }
  if (cardio.sameDay.length) {
    lines.push('', 'Cardio on lifting days:');
    for (const s of cardio.sameDay) {
      const tag = s.intensity ? ` (${s.intensity})` : '';
      const gap = s.gapHours === null
        ? 'times not logged'
        : `${Number(s.gapHours.toFixed(1))} h ${s.order} lifting`;
      lines.push(`  ${s.date}: ${s.modality} ${s.minutes} min${tag}, ${gap}`);
    }
  }
  return lines;
}

export function formatReport(result) {
  const w = (v) => weight(v, result.units);
  const lines = [`${result.athlete}, since ${result.since}`];

  // The phase (or phases) that covered *this period*, not the athlete's
  // phase today — reviewing a past block must not claim the current phase,
  // and a period spanning a phase change must say so rather than naming
  // only whichever phase happened to dominate.
  if (result.phase) {
    const p = result.phase;
    if (p.mixed) {
      lines.push('Phase: mixed period —');
      for (const s of p.segments) {
        if (s.phase === 'unrecorded') {
          lines.push(`  no phase recorded, ${s.daysInPeriod} day${s.daysInPeriod === 1 ? '' : 's'}${s.dominant ? ' (dominant)' : ''}`);
          continue;
        }
        const range = `${s.from}–${s.to ?? 'ongoing'}`;
        lines.push(`  ${s.phase}, ${range}${s.targetRate ? `, target ${s.targetRate}` : ''}${s.dominant ? ' (dominant)' : ''}`);
      }
    } else {
      lines.push(p.from
        ? `Phase: ${p.phase}, started ${p.from}${p.targetRate ? `, target ${p.targetRate}` : ''}`
        : `Phase: ${p.phase} (start date unknown)`);
    }
  }

  if (result.warnings?.length) {
    lines.push('', 'Warnings:');
    for (const w of result.warnings) lines.push(`  ${w}`);
  }

  // Said once, plainly: review decides what to do about it.
  if (result.profile?.stale) {
    lines.push('', result.profile.lastChecked
      ? `Profile last confirmed ${result.profile.lastChecked} (${result.profile.weeksAgo} weeks ago)`
      : result.profile.exists
        ? 'Profile has never been confirmed since it was written'
        : 'No profile.md for this athlete');
  }

  const bwLines = bodyweightLines(result.bodyweight, result.units);
  if (bwLines.length) lines.push('', ...bwLines);

  // Nothing closed in the period: say it once. Every table below would be
  // empty or zero-filled, and thirteen "0 of 4" rows bury the warnings
  // above them under noise the athlete cannot act on.
  // Cardio without lifting is still worth its block: it is what the
  // period held.
  if (result.sessions === 0) {
    const cardio = cardioLines(result.cardio);
    lines.push('', cardio.length ? 'No lifting sessions in this period.' : 'No closed sessions in this period.', ...cardio);
    // Skipped sessions are exactly what a period without lifting is about.
    if (result.fatigueSignals?.length) {
      lines.push('', 'Fatigue signals:');
      for (const s of result.fatigueSignals) lines.push(`  ${s}`);
    }
    return lines.join('\n');
  }

  lines.push('', 'Personal records:');
  if (result.prs.length) {
    for (const pr of result.prs) lines.push(`  ${pr.canonical}: e1RM ${w(pr.e1rm)} (${pr.date})`);
  } else lines.push('  none in this period');

  lines.push('', 'Main lifts:');
  if (result.mains.length) {
    for (const m of result.mains) {
      const note = m.rpeTrusted ? '' : ' [RPE unreliable]';
      const anchor = m.anchor ? `, vs 6–8 weeks earlier ${m.anchor.changePct >= 0 ? '+' : ''}${m.anchor.changePct}%` : '';
      lines.push(`  ${m.canonical}: ${m.trend}, smoothed e1RM ${w(m.smoothed)}, ${m.performances} sessions${anchor}${note}`);
    }
  } else lines.push('  no main lifts in this period');

  if (result.stalls.length) lines.push('', `Stalled: ${result.stalls.join(', ')}`);

  lines.push('', 'Weekly sets by primary muscle:');
  let currentWeek = null;
  for (const v of result.volume) {
    if (v.week !== currentWeek) {
      lines.push(`  ${v.week}`);
      currentWeek = v.week;
    }
    lines.push(`    ${v.muscle}: ${v.sets}`);
  }

  if (result.tonnage.length) {
    lines.push('', 'Weekly tonnage:');
    let currentTonnageWeek = null;
    for (const t of result.tonnage) {
      if (t.week !== currentTonnageWeek) {
        lines.push(`  ${t.week}`);
        currentTonnageWeek = t.week;
      }
      lines.push(`    ${t.exercise}: ${w(t.kg)}`);
    }
  }

  lines.push('', 'Frequency:');
  for (const f of result.frequency) {
    lines.push(`  ${f.week}: ${f.done}${f.target ? ` of ${f.target}` : ''}`);
  }

  if (result.misses?.length) {
    lines.push('', 'Misses:');
    for (const m of result.misses) lines.push(`  ${m.canonical} ${m.date}: ${m.where}`);
  }

  if (result.notes?.length) {
    lines.push('', 'Notes on lifts:');
    for (const n of result.notes) lines.push(`  ${n.canonical} ${n.date}: ${n.note}`);
  }

  lines.push(...cardioLines(result.cardio));

  if (result.fatigueSignals.length) {
    lines.push('', 'Fatigue signals:');
    for (const s of result.fatigueSignals) lines.push(`  ${s}`);
  }

  return lines.join('\n');
}

// RFC 4180: CRLF between records, and a field is quoted only when it holds
// a comma, a quote or a line break, with quotes doubled. Empty for null.
// A text cell starting with = + - @ (or a tab or CR) is a formula to a
// spreadsheet — the athlete's own export could run one (OWASP "CSV
// injection"). A leading apostrophe keeps it text; numbers never get one.
function csvField(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function formatCsv({ columns, rows }) {
  const lines = [columns.join(',')];
  for (const row of rows) lines.push(columns.map((c) => csvField(row[c])).join(','));
  return lines.join('\r\n') + '\r\n';
}

export function formatExerciseChange(result) {
  if (result.action === 'aliased') return `${result.canonical} now also answers to ${result.added.join(', ')}`;
  const also = result.aliases.length ? ` — also answers to ${result.aliases.join(', ')}` : '';
  return `added ${result.canonical}${also} (${result.equipment.join(', ')}; ${result.muscles.join(', ')}${result.main ? '; main lift' : ''})`;
}

const perSideText = (plates) => (plates.length ? `per side: ${plates.join(' + ')}` : 'just the bar');

export function formatLoad(r) {
  if (r.dumbbell) return `${r.load} ${r.units} dumbbells`;
  return `${r.load} ${r.units} — ${perSideText(r.perSide)}`;
}

export function formatWarmup(r) {
  if (!r.steps.length) return `No ramp for ${r.working} ${r.units}: it is the bar itself.`;
  return [`Warm-up for ${r.working} ${r.units}:`, ...r.steps.map((s) => `  ${s.load} ${r.units} × ${s.reps} — ${perSideText(s.perSide)}`)].join('\n');
}
