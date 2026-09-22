---
name: coach-log
description: This skill should be used when the athlete dictates a workout they just finished, in any wording, or asks to "log my workout", "record the session", "запиши тренировку", "записал тренировку", or runs /coach:log. It parses free-form dictation into the log format, records it, validates it, and reports deviations from the plan and any new records.
argument-hint: "[athlete] [date] <what you did>"
---

# Coach Log

Turns whatever the athlete says right after training — in their own words,
any order, any level of detail — into a correct `athletes/<id>/log/<date>.md`
file. This is the skill that runs most often right after a session, so
getting the parse right without pestering the athlete with ten small
questions matters as much as getting it right at all.

This document is written in English, for the model. Everything the coach
says to the athlete during a run is in the athlete's own language.

Plugin files — the statistics script, anything under `knowledge/` or
`templates/` — are addressed by their full path, which Claude Code fills in
before this text is read. The athlete's own files (`.coach.json`,
`exercises.md`, `athletes/<id>/...`) are relative to the working directory,
which during a run is the athlete's data folder, not the plugin. A skill
that gets this backwards cannot find a single file at runtime.

Take today's date from running `node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" today`.
Never state a date from memory.

## 1. Guard

Check for `.coach.json` in the working directory. Missing — tell the
athlete to run `/coach:init` and stop; this skill creates nothing on its
own. Present — check its `schema` field: anything other than `1` means the
plugin and the data folder are out of sync, so say so and stop without
attempting to auto-migrate.

## 2. Resolve the athlete

Per the athlete-resolution rule: the first argument, if it
case-insensitively matches an athlete's `id` or `name` in `.coach.json`,
selects that athlete; otherwise use `default_athlete`. There is no
session-level "current athlete" memory — resolve fresh every run.

Name the resolved athlete in the first line of the final reply ("Vera,
Lower A, 2026-09-22") so a wrong-athlete mistake is visible immediately.

Everything after the athlete-id argument (if one was consumed) and an
optional date argument (`YYYY-MM-DD`) is the dictation text itself — don't
try to strip more structure out of the arguments than that.

## 3. Find the target file

1. An explicit `YYYY-MM-DD` argument — that date's file, whether or not it
   exists yet.
2. Otherwise, run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" recent --athlete <id> --n 10 --json
   ```
   and take the row with `status: "planned"` dated **today**. That file is
   the target — this is the plan the athlete just trained. A planned file
   from an **earlier** date is not taken on its own: ask once whether the
   dictation is that session, trained late ("это тренировка за 2026-09-01?"),
   or today's — a session filed under an old plan's date moves it back in
   every trend and record, and the old plan stays open if it was never
   done.
3. Otherwise, the target is `athletes/<id>/log/<today>.md`, to be created
   fresh with no `## План`/`## Plan` section — only frontmatter, then
   `## Факт`/`## Actual`, then `## Заметки`/`## Notes`. Determine
   `session` the same way `/coach:plan` does: `program.md`'s `Meta →
   rotation`, the next name after the last `done` session from the
   `recent` output above. State that inferred name in the reply as an
   assumption ("logging this as Upper A — say so if that's wrong") rather
   than asking up front; if no program or rotation exists to infer from,
   ask for the session name directly.

**A dictation with cardio and no lifting** (a run on a rest day, a morning
row before an evening session) follows its own rule instead of 1–3 above:
it never goes into a planned lifting file from another date, and never
closes one. The target is `athletes/<id>/log/<date>.md` for the day it
happened — today, unless a date was given. If that file exists, planned or
done, add the lines to its `## Кардио`/`## Cardio` section and leave its
`status`, `session` and every other section exactly as they are: adding a
section is not an overwrite, so the three-way question below does not
apply, but say in the reply which file the cardio went into. If it doesn't
exist, create it with `session: Кардио` (`Cardio` for an English-speaking
athlete), `status: done`, and only `## Кардио`/`## Cardio` plus
`## Заметки`/`## Notes` — no exercise section at all. `validate` accepts a
done file with cardio and no exercises, and `stats` never counts such a
day toward `days_per_week` or the rotation.

**If the target file already has `status: done`** (the athlete is logging
into a slot that's already recorded), don't silently overwrite it. Ask:
add to it, replace it entirely, or cancel — same three-way choice
`/coach:plan` uses for an existing file, and wait for the answer before
step 7 writes anything.

## 4. Addressee check

Two people can share this data folder. A session logged into the wrong
one's file corrupts both histories silently, so this check runs before any
file is touched.

Do a first-pass, name-only resolution of the dictation: for each exercise
name that appears in the raw text, look it up in `exercises.md` (root of
the working directory) the same way step 5 does. This cheap pass is enough
here; the full set-by-set parse happens later and reuses it.

For every *other* athlete in `.coach.json`, find their own target file by
the same logic as step 3 (their latest `planned` file dated ≤ today, or
today's file if they have one). Compare the resolved exercise names from
the dictation against:
- the exercise list of the resolved athlete's own target session (its
  `## План`/`## Plan` section, or the program session it was inferred
  from), and
- the exercise list of each other athlete's target session.

Count overlapping canonical names for each. If another athlete's session
has a strictly higher overlap than the resolved athlete's own, stop and
ask with AskUserQuestion, naming both athletes and the mismatch ("this
looks more like Vera's planned Lower A — становая, выпады, икры all
match hers, none match your Upper A — log it for her instead?"). Proceed
with whichever athlete the answer confirms. If there's nothing to compare
against (no planned file for anyone on the relevant date), skip the check
silently — there's no signal either way.

## 5. Parse the dictation into `## Факт`/`## Actual` lines

Each line has the form:
```
- <exercise>: <set>, <set>, ... [— note]
```
and each set is:
```
<load>x<reps>[x<count>][@<rpe>]
```
- `<load>` — a number, or `BW`, or `BW+10` / `BW-5` for bodyweight plus or
  minus added/removed load.
- The `x` separator accepts Latin or Cyrillic, either case, or `*`
  (`x X х Х *`), and whitespace is tolerated around the separator and
  around `@` (`80 x 5`, `80x5 @ 7`, and `80x5@7` all parse the same way).
  This is read tolerance for dictation, not a writing style: when *this
  skill* generates a line, always write a plain Latin `x` with no spaces
  around it (`80x5`), matching every example below. The extended
  character set and loose spacing exist for files the athlete edited by
  hand — don't reproduce that laxity in what you write. The exact grammar
  the validator enforces lives in
  `${CLAUDE_PLUGIN_ROOT}/scripts/lib/parse-sets.mjs`; treat that file, not
  this description, as authoritative if the two ever disagree.
- `x<count>` after reps repeats an identical set that many times —
  `80x5x3` is three sets of 80×5, equivalent to writing `80x5, 80x5, 80x5`.
  Use it whenever the athlete describes repeated identical sets; don't
  expand it in the file.
- `@<rpe>` is 1–10 in steps of 0.5.
- A note after an em dash (`—`) or a plain double hyphen (`--`) at the end
  of the line applies to the whole exercise, not one set.
- A failed set can carry a miss location in parentheses right after that
  set, e.g. `100x3, 100x1 (срыв: низ)`. There's no controlled vocabulary
  for the location yet (no `knowledge/` file defines one) — record
  whatever term the athlete used, verbatim, in Russian or English.
  **Only one miss marker is recognized per exercise line** — the parser
  looks for it at the very end of the line, so a second `(miss: ...)`
  earlier in the line breaks the set token it's attached to instead of
  being read as a second marker. When more than one set on the same line
  failed at different points, put the single most informative sticking
  point in the trailing `(срыв: ...)`/`(miss: ...)` marker and mention the rest, in
  words, in the note after the dash — see the fourth worked example below.
- A dictated general remark that isn't tied to one exercise ("спал 6
  часов", "плечо ныло на разминке") goes into `## Заметки`/`## Notes`, not
  into a set line.
- If the athlete dictates cardio (running, rowing, cycling, etc.), it does
  not use this grammar — write it to `## Кардио`/`## Cardio` instead, one
  line per activity (a run and a row on the same day are two lines, not
  one): modality, minutes, then RPE or a `Z<zone>` tag, optionally a
  distance and a start time, optionally a note after an em dash (the cardio
  example below shows the exact line).
- v1 has no format for time-based holds (planks, static holds) — put those
  in Notes, not a set line.
- A day with cardio and no lifting at all gets no exercise section — see
  step 3 for which file it goes into.

### Worked examples

**"Жим лёжа сделал 80 на 5 три раза, RPE 7 в первом, потом 7.5 и 8. Тяга
штанги в наклоне — 70 на 8 дважды, потом 70 на 7, спина забилась на
последнем. Подтягивания — свой вес на 8, 7, 6."**
```
## Факт
- Жим штанги лёжа: 80x5 @7, 80x5 @7.5, 80x5 @8
- Тяга штанги в наклоне: 70x8x2, 70x7 — спина забилась на последнем
- Подтягивания прямым хватом: BWx8, BWx7, BWx6
```

**"Squats — 100 for 5 three times at RPE 8, then went for 110 for 3 but
only got 2, missed at the bottom. Weighted dip, bodyweight plus 10, for
6, 6, 5."**
```
## Actual
- Back Squat: 100x5x3 @8, 110x2 (miss: bottom)
- Weighted Dip: BW+10x6, BW+10x6, BW+10x5
```

**"Жим гантелей сидя — 24 на 10, потом 26 на 8 дважды, дошёл до отказа на
последнем подходе. Разводка в стороны, 12 на 12, три подхода."**
```
## Факт
- Жим гантелей сидя: 24x10, 26x8, 26x8 — дошёл до отказа на последнем подходе
- Разведение гантелей в стороны: 12x12x3
```
("разводка в стороны" is unambiguous on its own — the qualifier resolves
it to lateral raise per `${CLAUDE_PLUGIN_ROOT}/knowledge/exercises.md` §9 —
unlike a bare "разводка", see below. The file records the table's
canonical name, `Разведение гантелей в стороны`, not the dictated
"разводка".)

**"Присед — первый подход 100 на 5, сорвался в верхней точке, второй
подход 90 на 5, тоже не добил, сорвался внизу."** Two sets failed at
different points on one line — only the last marker survives parsing, so
the earlier one has to move into the note instead of a second
parenthetical:
```
## Факт
- Присед со штангой на спине: 100x5, 90x5 (срыв: низ) — первый подход тоже сорвался, в верхней точке
```

**"Сегодня только бегал — 45 минут, вторая зона, восемь километров, начал
в семь утра."** No lifting that day, so the file has no `## Факт` at all:
```
## Кардио
- Бег 45мин Z2, 8км, 07:00
```

### Resolving names

Resolve every exercise name against `exercises.md` (the shared file in the
working directory root, not the plugin's
`${CLAUDE_PLUGIN_ROOT}/knowledge/exercises.md`) by asking the script, not
by reading the table — it folds case, spacing and `ё → е` exactly the way
every later command will:
```
node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" exercises --stdin --json --athlete <id> --n 1 <<'COACH_JSON'
{"names": ["<every name as dictated>"]}
COACH_JSON
```
An item with `known: true` resolves to its `canonical`; `known: false` is
unknown (below). There is no fuzzy matching. Always write the canonical
name into the file, never the dictated spelling.

**Ambiguous bare names.** A bare "жим", "тяга", "разводка", "икры",
"пресс", or "бабочка" (with no qualifying word) is a muscle group or a
genuinely ambiguous term, not one exercise — resolving it silently is a
guess wearing the coach's authority. Apply the exact rule for that term
from `${CLAUDE_PLUGIN_ROOT}/knowledge/exercises.md` §9: some terms it says to
ask outright; others give a stated default. In every case — asked or
defaulted — surface the resolved exercise to the athlete for a one-line
confirmation before it goes in the file ("жим лёжа, верно?"). Never write
an ambiguous name's resolution without that confirmation, even when a
default exists — unless the plan settles it (below).

**Unknown names.** A name that isn't in `exercises.md` and isn't one of
the ambiguous terms in knowledge §9 is genuinely new. Don't ask about
these one at a time — collect every unknown name from the whole dictation
first, then ask once, as a single list, whether to add each as a new row
(using the dictated spelling as its first alias) or match it to an
existing exercise the athlete meant. On confirmation, add the accepted
ones to `exercises.md` before writing the log file, so the log references
a name that already resolves — through the statistics script, never by editing the file. A new row:
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
and ask, as `coach-exercise` §6 does, rather than working around it.

**A name the plan already settles.** An unknown or ambiguous name is most
often the athlete's shorthand for a line of today's plan. When the target
file has a `## План`/`## Plan` section and the dictated name fits exactly
one planned exercise — its words are that exercise's own words, shortened
or reordered — the plan has already answered the question: write that
exercise's canonical name without asking first. Say in the reply what the
dictated name was written as, and offer to keep the spelling as an alias
with `exercise alias --stdin` (as above), so the next dictation resolves
without the plan. A name that fits two planned lines, or none, is asked
about as above; a different exercise from the planned one is a
substitution, reported with the deviations in the reply (step 9), never a respelling.
With `- Подъём на носки стоя в тренажёре: 3x15 @45` in the plan, "подъём
на носки 45 на 15, три подхода" writes
```
## Факт
- Подъём на носки стоя в тренажёре: 45x15x3
```
and the reply says «"подъём на носки" — записал как «Подъём на носки
стоя в тренажёре» из плана; запомнить это написание?».

## 6. Effort ratings, duration, feel

If any exercise marked `Main: yes` in `exercises.md` has a set with no
`@rpe` anywhere in its line, don't ask about it exercise by exercise —
collect every such main lift into one question at the end ("no RPE for
Жим лёжа or Присед — what were they?") and fill in the answers. Ask only
when the programme actually uses RPE — its `## Progression rules` name a
target RPE or an RPE step. A programme that progresses by fixed
increments or percentages (a Texas Method block, a novice linear
progression) was chosen partly so the athlete need not rate every set;
there, leave a missing RPE missing and don't relay `validate`'s warning
about it.

`duration_min` and `feel` (1–5) never hold the file back: they change no
record and no load, and a session kept out of the log until an optional
question is answered is a session that can be lost. If the dictation
left either out, write the file without it in step 7 and ask at the end
of the reply — one question for whatever is missing, never two (step 9).
An answer adds them to the frontmatter and `validate` runs again; no answer
leaves both keys out entirely — never a guess or a placeholder. If
bodyweight or a session start time were mentioned in the dictation,
record them in `bodyweight` / `time`; don't ask for either if they
weren't mentioned.

## 7. Write the file, then validate

Write frontmatter (`date`, `session`, `status: done`, plus whichever of
`duration_min`, `time`, `feel`, `bodyweight` apply), the `## Факт`/
`## Actual` section from step 5, the `## Кардио`/`## Cardio` section if
any cardio was dictated, and `## Заметки`/`## Notes` from any general
remarks. If the target file already had a `## План`/`## Plan` section
(step 3 found a planned file), leave it exactly as written — it's the
record the reply compares against in step 9. An existing `## Кардио`/
`## Cardio` section stays too — it is a record of cardio actually done —
and if the file was a cardio-only day (`session: Кардио`/`Cardio`) that
now gets lifting, set `session` to the rotation's session the way step 3
infers it, so the day stops reading as cardio only.

Then run:
```
node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" validate athletes/<id>/log/<date>.md
```
`ERROR` lines mean the file is malformed (a set line the grammar can't
parse, an RPE off the 1–10/0.5 grid, a missing required key) — fix the
file and re-run `validate` until every file reports `OK`, not just until
the errors look gone. `WARN` lines (unknown exercise, a main lift still
missing RPE, `feel` out of range) are shown to the athlete as-is in step
9; by this point they should mostly already be resolved by steps 5–6, so a
leftover warning usually means the athlete declined to add an unknown name
or answer an RPE question — that's a legitimate reason for a warning to
remain, not a bug to silently paper over.

## 8. Skipped sessions

When the athlete says they skipped the session ("пропустил", "не пошёл",
"skipped it") instead of dictating sets: find the target file the same
way as step 3, set `status: skipped`, put the reason in
`## Заметки`/`## Notes` (verbatim, however brief), and leave
`## Факт`/`## Actual` empty — `validate` doesn't check that section for
`status: skipped`. Still run `validate` on the file. An unlogged session
doesn't exist for the coach: recording a skip is
what keeps `brief`, `plan`, and `report` aware that a slot in the rotation
was missed rather than simply invisible.

## 9. Reply

Open with the athlete's name, the session, and the date. Then:

- **What was written** — the `## Факт`/`## Actual` lines exactly as they
  now stand in the file (and the cardio lines, if any). On a phone this is
  the only way the athlete sees the log without opening it, and a
  misheard number is caught here or never.

- **Deviations from the plan**, if the target file had a `## План`/
  `## Plan` section: for each planned exercise, say whether it was done as
  planned, done at a different weight, substituted for something else, or
  skipped; for anything dictated that wasn't on the plan, say so too. Skip
  this whole part for a file that never had a plan.
- **New records.** For every exercise actually performed (not for a
  skipped session or a cardio-only day), run:
  ```
  node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" exercises "<name 1>" "<name 2>" ... --athlete <id> --n 1 --json
  ```
  and read each item's `latest` block — the script decides what counts,
  so nothing here is judged by eye. Use it only when `latest.date` is the
  date of the file just written. Then announce, with both numbers:
  - `newLoadRecord` — the heaviest load of that lift so far ("PR load 105
    kg"), and `newE1rmRecord` — the best estimated max so far;
  - each entry of `newRepRecords` ("5 reps: 105 kg, was 102.5"); when
    several consecutive rep counts were set at one load, name the range
    once ("2–5 reps at 120 kg") instead of one line each.
  All three are strict: matching an earlier best is not a record, and a
  first-ever performance has nothing to beat. Announce nothing else as a
  record.
- **A number that may have been misheard.** If an item's
  `latest.loadChangePct` is above +25 or below −25, say so before the
  records and ask once whether the load was heard right ("жим 18 — было
  80 в прошлый раз, верно?"); fix the file and re-run `validate` if it was
  not. A real jump confirmed by the athlete stays as written.
- **One line of advice for next time, only when it's obvious** from what
  `stats` just showed (a clear miss — a non-null `miss` on today's
  performance, which also carries where it stopped — or an RPE far above
  what was planned). Stalls are `report`'s to flag, not this skill's —
  this is a light touch, not `review`'s job of
  interpreting trends; when nothing stands out, leave this line out
  entirely rather than inventing one.
- **Duration and feel**, last, and only for what the dictation left out —
  the one question from step 6 ("сколько длилась и как ощущения, 1–5?"),
  after everything else, so leaving it unanswered costs nothing.

## Rules that apply throughout

- **Never overwrite an existing `done` file for a date without an
  explicit choice from the athlete** — step 3.
- **Dates always come from `stats.mjs today`**, never memory or estimation.
- **Nothing this skill states about the past — weights, PRs, dates —
  comes from anywhere but `stats` output or the log files themselves.**
- **Ambiguous or unknown exercise names are never resolved silently** —
  every one is either asked about individually (ambiguous terms) or
  batched into one confirmation question (unknowns) before the file is
  written, unless the plan settles it (step 5) — and then the reply says what
  it was written as.
- **A skipped session is still written, with a reason** — it is never
  simply left absent.
- Plugin-side text (this file, knowledge references) is English;
  everything said to the athlete, and the log file itself, is in their
  language.
