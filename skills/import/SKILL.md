---
name: coach-import
description: This skill should be used when the athlete pastes old workouts from a paper notebook, sends photos of its pages, or asks to "import my history", "load my old workouts", "перенести тетрадь", "импортировать тренировки", or runs /coach:import. It transcribes photos for the athlete to check first, splits the text by date, normalizes exercise names, and writes one log file per day.
argument-hint: "[athlete] <pasted notebook or photos>"
---

# Coach Import

Turns years of a paper training log, pasted in one go, into one
`athletes/<id>/log/<date>.md` file per day. A single paste routinely holds
dozens of sessions across many months, several handwriting styles, and
whatever date shorthand the athlete actually used on paper — this skill's
whole job is getting that split right without turning the import into a
forty-question interview.

This document is written in English, for the model. Everything the coach
says to the athlete during a run is in the athlete's own language.

Plugin files — the statistics script, anything under `knowledge/` or
`templates/` — are addressed by their full path, which Claude Code fills in
before this text is read. The athlete's own files (`.coach.json`,
`exercises.md`, `athletes/<id>/...`) are relative to the working
directory, which during a run is the athlete's data folder, not the
plugin. A skill that gets this backwards cannot find a single file at
runtime.

Take today's date from running `node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" today`.
Never state a date from memory; it is also the only thing a resolved import date is ever checked
against (§4).

## 1. Guard

Check for `.coach.json` in the working directory. Missing — tell the
athlete to run `/coach:init` and stop; this skill creates nothing on its
own. Present — check its `schema` field: anything other than `1` means
the plugin and the data folder are out of sync, so say so and stop
without attempting to auto-migrate.

## 2. Resolve the athlete

Per the athlete-resolution rule: the first argument, if it
case-insensitively matches an athlete's `id` or `name` in `.coach.json`,
selects that athlete; otherwise use `default_athlete`. There is no
session-level "current athlete" memory — resolve fresh every run.
Everything after the athlete-id argument (if one was consumed) is the
pasted notebook text itself — don't try to strip further structure out of
the arguments than that.

Name the resolved athlete in the first line of the final reply ("Vera,
importing 47 sessions") so a wrong-athlete mistake is visible immediately,
before a single file is written.

## 2a. Photos of the notebook

If the athlete sends photos or scans of notebook pages instead of text —
or alongside it — the pages become text first, and nothing below runs on
an image directly.

1. **Transcribe each page verbatim**, line by line, in the page's order:
   the athlete's own abbreviations, their own date shorthand, crossed-out
   lines left out. Don't normalize names, fix arithmetic, or fill in a
   number that isn't on the page — that is §4–§6's job, with the athlete.
2. **Mark every character you cannot read with `[?]`** — `1[?]0x5`, not
   `110x5` or `120x5`. Never guess a digit from handwriting: a guessed
   weight sits in the log as a real one, and a record, for good. The same
   for a whole unreadable line: `[?] line unreadable`.
3. **Show the transcription back and wait.** Many pages go in batches of
   a few, so corrections stay manageable. Ask the athlete to fix anything
   wrong and to resolve each `[?]` — or say to drop that line. If the
   pages carry no dates and their order isn't obvious, ask for the order
   too.
4. **The corrected text is the paste.** Continue at §3 with it exactly as
   if the athlete had typed it; a line they chose to drop is left out,
   and a `[?]` they couldn't resolve never reaches a set line — it goes
   to that day's `## Заметки`/`## Notes` in their words.

## 3. Split the pasted text into day-blocks

Scan the pasted text top to bottom. A line that is, or starts with, a
date-shaped token opens a new block; every following line, up to the next
such line or the end of the text, belongs to that block. A weekday name
or abbreviation next to the date ("пн 12.03", "12.03 (пятница)",
"Monday 03/12") is decorative — read past it, never use it to derive or
correct the date.

Accepted date shapes, all day-first (this plugin never reads a date
month-first, so `12/03` is 12 March, the same as `12.03`):

- `DD.MM` — `12.03`
- `DD.MM.YY` / `DD.MM.YYYY` — `12.03.25`, `12.03.2025`; a two-digit year
  always means `20YY`
- `DD/MM` — `12/03` (same day-first rule as the dotted form)
- ISO `YYYY-MM-DD` — `2025-03-12`
- Day + Russian month name, genitive, with or without a year — `12
  марта`, `12 марта 2025` (full month list: января, февраля, марта,
  апреля, мая, июня, июля, августа, сентября, октября, ноября, декабря)
- A **bare number alone on its own line**, immediately followed by lines
  that read as a workout (exercise names, not more numbers) — accept it
  as a day-of-month *only* when a neighboring block in the same paste
  already establishes the month (the block just before or just after uses
  an explicit month that a day this size is consistent with). It always
  arrives with the year missing (§4) and the inferred month must be
  confirmed there too. If nothing nearby anchors a month, don't guess —
  treat it as unreadable (§4).

Any block whose opening line matches none of these shapes, or carries no
date token at all, is unreadable — collect it, don't invent a date for
it (§4).

### Worked example

Pasted text:

```
пн 12.03.25
Жим лёжа 80х5 80х5 80х5 РПЕ 8
Тяга штанги в наклоне 70х8 70х8

14.03
Присед 100х5 100х5 100х5
Жим ногами 150х10

19
Становая 120х5
Гиперэкстензия 15 15 15

продолжение с прошлой страницы, забыл дату
Жим гантелей сидя 24х10 26х8 26х8

2025-03-21
Подтягивания 8 7 6
```

Splits into five blocks:

| Block | Date token | Resolution |
|---|---|---|
| 1 | `пн 12.03.25` | `2025-03-12` — weekday dropped, year explicit, done |
| 2 | `14.03` | day 14, month 03, **year missing** |
| 3 | `19` (bare) | preceding block is March and nothing contradicts it → day 19, month inferred **03**, **year missing** |
| 4 | none ("продолжение с прошлой страницы, забыл дату") | **unreadable** — no date token at all |
| 5 | `2025-03-21` | `2025-03-21` — ISO, done |

Blocks 2 and 3 go into one missing-year question; block 4 goes into one
unreadable-date question. Both are asked together, once, before any
exercise parsing or file writing happens — see §4.

### Converted output

Once block 1's date and block 2's date (with 2025 confirmed as the
missing year, §4) are settled, and the exercise names resolve against
`exercises.md` (§6 — "Жим лёжа" is an alias of the canonical
`Жим штанги лёжа`; "Присед", "Тяга штанги в наклоне" and "Жим ногами" are
each direct matches, none of them are one of the ambiguous bare terms in
knowledge §9), blocks 1 and 2 become:

```
---
date: 2025-03-12
session: Imported
status: done
---

## Факт
- Жим штанги лёжа: 80x5x3 @8
- Тяга штанги в наклоне: 70x8x2
```

```
---
date: 2025-03-14
session: Imported
status: done
---

## Факт
- Присед со штангой на спине: 100x5x3
- Жим ногами: 150x10
```

Both exercise lines in both files parse clean with zero errors through
`scripts/lib/parse-sets.mjs` — verify every line this skill is about to
write the same way before it's committed to a file, per §5. Note the
conversions the raw text needed: three identical space-separated `80х5`
repetitions plus a trailing Cyrillic "РПЕ 8" became the single token
`80x5x3 @8` (the count-multiplier syntax, with the trailing RPE applied
as the shared `@8` — the raw shorthand itself, "80x5 80x5 80x5 РПЕ 8",
does not parse); two identical `70х8` repetitions became `70x8x2`.

## 4. Resolve missing or unreadable dates, once, for the whole paste

Never silently assume a year, even when other blocks in the same paste
carry an explicit one — a notebook page can cross a year boundary (a
December entry followed by January of the next year) without saying so.
Instead:

- **Missing year.** Collect every block whose date lacks a year (both
  written-but-yearless and bare-number-inferred ones) into a single list,
  in the order they appear. Ask one question covering the whole list,
  showing each date candidate and, where one was inferred from a
  neighbor (the bare-number case), stating the inferred month so the
  athlete confirms or corrects it in the same answer. Reference nearby
  explicit dates as context to make the question fast to answer, but
  still ask — don't skip the question just because a year seems obvious.
- **Unreadable.** Collect every block with no usable date token into a
  single list, each entry showing its first line or two so the athlete
  recognizes it. Ask one question covering the whole list: supply the
  correct date, or say to skip that block.

Issue both as one batch — a single round of clarifying questions, not one
exchange per date and not a separate round for each category if they can
be asked together. This is the only date-related question this skill
asks; nothing about dates is asked again later in the run.

**Sanity check.** After resolving a date (year included), if it falls
after today's date (from `stats.mjs today`), that's almost certainly a
misread year — fold it into the same clarifying question rather than
writing it silently.

A block the athlete says to skip is dropped here and recorded later in
the final report as skipped, with the reason "date could not be
determined."

## 5. Parse each remaining block's exercises

Within a block, exercise lines follow the same grammar `coach-log` uses:
`- <exercise>: <set>, <set>, ... [— note]`, each set
`<load>x<reps>[x<count>][@<rpe>]`, where `x` is Latin or Cyrillic in
either case or `*`, `<load>` is a number or `BW`/`BW+N`/`BW-N`, and
`@<rpe>` is 1–10 in steps of 0.5. The exact grammar the validator
enforces lives in `${CLAUDE_PLUGIN_ROOT}/scripts/lib/parse-sets.mjs`; treat
that file, not this description, as authoritative if the two ever
disagree, and run any line this skill is about to write through it
before the line goes into a file — an example that doesn't parse is
worse than no example.

A note after `—` or `--` at the end of a line applies to the whole
exercise; a failed set can carry a miss location in parentheses
(`100x3, 100x1 (срыв: низ)`), verbatim, whatever term the athlete's own
notes used. **Only one miss marker is recognized per exercise line** —
the same limit `coach-log` documents — the parser looks for it at the
very end of the line, so a block that records more than one sticking
point on the same exercise keeps the single most informative one in the
trailing marker and puts the rest, in words, in the note after the dash.
A dictated cardio line goes into `## Кардио`/`## Cardio` using `coach-log`'s
cardio line format, not this grammar. A notebook day with cardio
and no lifting at all becomes a file with `session: Кардио`/`Cardio`,
`status: done` and no exercise section — the same rule `coach-log` uses.
v1 also has no format for
time-based holds (planks, static holds — common in older
bodybuilding-style notebooks) — those go into `## Заметки`/`## Notes`,
not a set line, the same limitation `coach-log` documents.

**Old notebooks are usually incomplete, and that's fine.** Import
whatever is actually on the page; never invent a missing number and never
ask the athlete to reconstruct a rating from a session a year old —
that's the one question this skill does not ask, at any point:

- No RPE anywhere on an exercise, including on a `Main: yes` lift — leave
  `@rpe` off every set. `validate` will warn about it later; that warning
  is expected and stays in the report as-is, not something to chase down
  with the athlete.
- A line that gives a weight but no readable rep count (common on
  half-legible pages) cannot become a valid set — it has no `reps` to put
  in the grammar. Don't guess a rep number. Put the line verbatim into
  `## Заметки`/`## Notes` instead, and note in the final report that it
  was recorded as a note, not a parsed set, and why.
- The mirror case: **bare rep counts with no load at all** (`8 7 6`, or
  `8, 7, 6`) is how a paper log almost always records bodyweight work —
  the grammar has no set shape for a number with no `x` and no load, so
  this cannot be written as-is either. Once §6 has resolved the
  exercise's row in `exercises.md`, check its `Equipment` column: if it
  includes `bodyweight` (pull-ups, bodyweight dips, an unweighted back
  extension, etc.), convert each bare number into a `BWxN` set —
  "Подтягивания 8 7 6" becomes `BWx8, BWx7, BWx6`. If the resolved
  exercise's equipment does *not* include `bodyweight`, a bare rep count
  still isn't a valid set — don't invent a load for it; treat the line
  exactly like the weight-with-no-reps case above and put it in Notes.
- No duration, feel, or bodyweight mentioned anywhere for a day — leave
  those frontmatter keys out of that file entirely, the same as `coach-log`
  does when the athlete doesn't mention them. Never write a placeholder.
- A remark that isn't tied to one exercise (illness, sleep, a missing
  page, "не помню сколько было") goes into `## Заметки`/`## Notes`.
- **A block with no readable set and no cardio at all** — every line
  ended up in Notes by the rules above — is not written as a day. A done
  file with nothing in `## Факт`/`## Actual` or `## Кардио`/`## Cardio` is
  malformed (`validate` fails it), and the only way to "fix" it would be
  to invent a set. List such blocks in the §10 summary as skipped, with
  their lines verbatim, so the athlete can supply the missing numbers or
  let them go.

## 6. Normalize exercise names, once, for the whole batch

Resolve every exercise name against `exercises.md` (the shared file in
the working directory root — not the plugin's
`${CLAUDE_PLUGIN_ROOT}/knowledge/exercises.md`) by asking the script, the
same way `coach-log` does — it folds case, spacing and `ё → е` exactly as
every later command will, so nothing is matched by eye:
```
node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" exercises --stdin --json --athlete <id> --n 1 <<'COACH_JSON'
{"names": ["<every distinct name in the paste, as written>"]}
COACH_JSON
```
`known: true` resolves to `canonical`; `known: false` is unknown (below).
There is no fuzzy matching. Always write the canonical name
into the file, never the dictated spelling. This step runs after every
block has been parsed (§5), across the whole import, so each kind of
question below is asked once total, not once per day.

**Ambiguous bare names.** A bare "жим", "тяга", "разводка", "икры",
"пресс", "бабочка", or any other term `${CLAUDE_PLUGIN_ROOT}/knowledge/exercises.md`
§9 lists, resolves per that section's rule (ask, or apply its stated
default) — but batched by *distinct raw term*, not by occurrence: collect
every different bare term that shows up anywhere in the paste, resolve
each one once, and apply that single answer to every occurrence of that
exact term across all days. If two occurrences of the same bare term
plainly belong to different exercises (e.g. one block is clearly upper
body, another clearly lower body, and applying one answer to both would
be wrong), list that occurrence as its own line in the same batched
question instead of forcing a single answer over it. Never resolve one of
these silently, even when knowledge §9 states a default — surface it for
confirmation the same way `coach-log` does, just batched.

**Unknown names.** A name that isn't in `exercises.md` and isn't one of
the ambiguous terms above is genuinely new. Collect every unknown name
from the entire paste first — not per day — then ask once, as a single
list, whether to add each as a new row (the dictated spelling becomes the
canonical name and its own first alias, matching `coach-log`'s rule) or
match it to an existing exercise the athlete meant. If the athlete gives
a cleaner canonical name instead of the dictated one, use that, with the
dictated spelling kept as an alias. On confirmation, add the accepted
rows to `exercises.md` before any log file is written, so every log
references a name that already resolves — through the statistics script, never by editing the file. A new row:
```
node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" exercise add --stdin <<'COACH_JSON'
{"name": "<name>", "aliases": ["<dictated spelling>"], "equipment": ["…"], "muscles": ["<primary>", "…"], "main": false}
COACH_JSON
```
or, when the athlete matched it to an exercise the table already has
under another name, `exercise alias --stdin` with
`{"name": "<existing>", "aliases": ["<spelling>"]}` the same way. The
quoted heredoc keeps the shell from touching the athlete's words. The
script refuses a name another exercise already answers to — relay that
and ask, as `coach-exercise` §6 does, rather than working around it. Anything left unresolved because
the athlete declined stays under its raw spelling and shows up as a
`validate` warning later — that's expected, not a bug to paper over.

## 7. Date collisions — duplicates within the paste, and files already on disk

A resolved date can collide two different ways, and both have to be
caught before a single file is written, not just the second one to be
noticed:

- **Duplicate within this paste.** Two or more parsed blocks resolve to
  the *same* date. This is not hypothetical — a notebook page that
  continues onto the next sheet, or a session written up twice, produces
  exactly this. Neither block has a file on disk yet, so the check below
  never sees it; it has to be found by comparing the resolved dates of
  all the blocks against each other, before §8 writes anything.
- **Already on disk.** A resolved date already has a file at
  `athletes/<id>/log/<date>.md`, from a previous `coach-import`,
  `coach-log`, or `coach-plan` run.

Collect every date that collides either way into one list — for a
same-paste duplicate, a short summary of each colliding block's
exercises; for an on-disk collision, the existing file's `session` and
`status` next to a one-line summary of what this import would add. Ask
one batched question covering the whole list, and wait for every answer
before §8 writes anything for any of these dates. Dates with no collision
of either kind aren't blocked by this question.

- **Same-paste duplicate** — merge the colliding blocks into a single
  day (their parsed facts combined, deduplicated per the rule below), or
  keep only one of them and drop the rest — the athlete says which; each
  dropped block is recorded in the final report as skipped, reason
  "duplicate of the entry kept for this date."
- **On-disk collision** — **merge**: append the imported facts under the
  existing `## Факт`/`## Actual` section (creating that section if the
  existing file was `status: planned` with none), leave any existing
  `## План`/`## Plan` untouched, append rather than replace
  `## Заметки`/`## Notes`, and set `status: done` if it wasn't already.
  **Skip**: leave the existing file exactly as it is; record the date in
  the final report as skipped, reason "existing file kept."

**A merge never appends a line that's already there.** Whenever this step
adds facts to a file that already holds some — an on-disk merge, or a
same-paste merge of two or more blocks — compare each new exercise line's
canonical name and its full, ordered set list (load, reps, rpe) against
the lines already present in the target. A line that matches one already
there exactly is not written a second time; list it in the final report
as a skipped duplicate (e.g. "Жим штанги лёжа: 80x5x3 @8 — already logged
for this date, not repeated"). Anything that differs even in one value
(a different weight, an extra set, a different RPE) is not a duplicate
and gets appended normally. This is what keeps a re-run of the same
import, or a notebook that genuinely repeats a session, from silently
doubling tonnage and e1RM.

## 8. Write the files

For every block that survived §4 and §7 (not skipped for an unreadable
date in §4, not dropped as a same-paste duplicate or an on-disk skip in
§7): write or update
`athletes/<id>/log/<date>.md`. An imported day never gets a
`## План`/`## Plan` section — frontmatter goes straight into
`## Факт`/`## Actual`, then `## Кардио`/`## Cardio` if any cardio was in
the block, then `## Заметки`/`## Notes` for anything from §5 that
couldn't become a set line.

Frontmatter: `date` (matching the filename), `status: done`, plus
whichever of `duration_min`, `time`, `feel`, `bodyweight` were actually
present in that block's text. `session` comes from the block's own text
when it plainly names one — a session or split name matching a
`### <name>` header in `athletes/<id>/program.md` if a program exists, or
an unambiguous term the athlete used consistently on paper (e.g. "верх",
"ноги"). When nothing in the block names a session, use the literal
marker `Imported` — don't ask, this is a default, not a question.

Process blocks in the order they appear in the pasted text. Don't narrate
each one as it's written ("day 1: done, day 2: done...") — the athlete
gets one summary at the end (§10), not a play-by-play.

## 9. Validate

Run, once, over every file written or updated in this run:
```
node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" validate athletes/<id>/log/<date-1>.md athletes/<id>/log/<date-2>.md ...
```
`ERROR` lines mean this skill's own parse produced a malformed file (a set
line the grammar can't read, a bad RPE, a missing required key) — that's
a bug in this run, not the athlete's data; fix the file and re-run
`validate` until every file reports `OK`. `WARN` lines (unknown exercise
still unresolved, a main lift with no RPE, `feel` out of range) are
expected for old, incomplete data and go into the report as-is — most of
them, for genuinely old sessions, are simply data that was never
recorded.

## 10. Reply — one summary, not a log per day

Open with the resolved athlete's name and a one-line total. Then:

- **Days imported** — count, and the date range covered (earliest to
  latest).
- **New exercises added** — the canonical names added to `exercises.md`
  in §6, each with the dictated spelling that became its alias.
- **Warnings** — from `validate` in §9, grouped by kind with a count
  (e.g. "12 sessions have no RPE on a main lift — expected for old data");
  list individual lines only if there are few enough to be useful,
  otherwise offer to show the full list if asked.
- **Skipped, with reason** — every block dropped in §4 (unreadable date,
  athlete declined), in §7 (a same-paste duplicate dropped, an existing
  file kept), or a duplicate line skipped during a merge in §7, each with
  its date or block excerpt and the reason.

## Rules that apply throughout

- **Never invent a missing number.** No reps, no RPE, no duration, no
  feel, no bodyweight is ever guessed to fill a gap in old data — see §5.
- **Never ask the athlete to reconstruct a rating for an old session.**
  A missing RPE, duration, or feel is simply left out; it is not a
  clarifying question.
- **Never overwrite an existing file, and never let a same-paste
  duplicate silently overwrite another block, without an explicit
  merge/skip choice** — §7.
- **A merge never re-appends a line that's already there**, matched on
  canonical name plus the full ordered set list — §7.
- **Never invent a date.** A date that can't be read is collected and
  asked about, once, in the same batch as every other unreadable date —
  §4.
- **Questions are batched by category, never asked once per day** — one
  round for missing/unreadable dates (§4), one for ambiguous and unknown
  exercise names (§6), one for date collisions, same-paste duplicates and
  on-disk alike (§7).
- **An imported day never has a `## План`/`## Plan` section** and always
  gets `status: done` — §8; a block with nothing readable in it is not a
  day and is not written (§5).
- **Dates are checked against `stats.mjs today` only for the future-date sanity
  check in §4**, never guessed from memory.
- **The athlete gets one final summary, not a per-day narration** — §8,
  §10.
- Plugin-side text (this file, knowledge references) is English;
  everything said to the athlete, and the log files themselves, is in
  their language.
