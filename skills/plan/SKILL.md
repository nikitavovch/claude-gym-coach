---
name: coach-plan
description: This skill should be used when the user asks "what am I doing today", "write my workout", "plan the session", "что сегодня", "напиши тренировку", or runs /coach:plan. It writes the next workout from the athlete's program and recent history.
argument-hint: "[athlete] [date or session]"
---

# Coach Plan

Writes the next workout — the session the athlete does today, or another
date if they ask — from their program, their gym inventory, and their
recent training history. This is the skill the athlete runs most often,
usually right before leaving for the gym, so getting the athlete and the
weights right matters more here than almost anywhere else in the plugin.

This document is written in English, for the model. Everything the coach
says to the athlete during a run is in the athlete's own language.

Plugin files — the statistics script, anything under `knowledge/` or
`templates/` — are addressed by their full path, which Claude Code fills in
before this text is read. The athlete's own files (`.coach.json`,
`athletes/<id>/...`) are relative to the working directory, which during a
run is the athlete's data folder, not the plugin. A skill that gets this
backwards cannot find a single file at runtime.

Take today's date from running `node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" today`.
Never state a date from memory.

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
session-level "current athlete" memory — resolve fresh every run, since a
stale guess written to the wrong athlete's log is worse than asking.

Whatever athlete is resolved, name them in the first line of the final
reply ("Vera, Lower A, 2026-09-22") so a wrong-athlete mistake is visible
immediately, before the athlete reads anything else.

## 3. Date and session-name arguments

Take the date from `node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" today`.
After the athlete-id argument (if one was
consumed), at most one more positional argument may follow:
- If it matches `YYYY-MM-DD`, it replaces today's date — the athlete is
  planning ahead or filling in a date they missed.
- Otherwise, treat it as a session-name override, to be matched against
  the `### <name>` headers under `## Sessions` in `program.md` once that
  file is read in step 6. It replaces the rotation-based session choice,
  not the date.
Only one of the two is ever given at once — that mirrors how an athlete
would actually phrase it ("plan Friday" vs. "plan upper A").

## 4. Check for a stale planned session

Run:
```
node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" brief --json
node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" recent --athlete <id> --n 5
```
`brief`'s `openPlanned` for this athlete lists every planned file dated
before today, however far back — `recent`'s five rows can miss an old
one. If there is one, surface it before anything else in the reply — before the new
plan, before any other observation. Offer the athlete a choice of three:
- **Log it** — tell them to run `/coach:log` for that date; this skill
  doesn't parse free-text diction, so don't try to fill in the facts here.
- **Drop it** — set that file's `status` to `skipped` and add a short note
  to its Notes section ("skipped — superseded, never logged").
- **Move it** — the old plan becomes today's plan: rename the file to
  today's date and update its `date` frontmatter field to match. Once
  moved, treat it exactly like an existing file for the target date
  (step 5) — if a separate file for that date also already exists, that
  collision gets resolved the same way step 5 resolves any other.
Wait for the athlete's choice before generating a new plan. If they were
already asking to plan a *different* date than the stale file's, still
surface the reminder first, then proceed with the date they asked for
once you've noted it and gotten their choice on the stale one.

## 5. Check for an existing file on the target date

If `athletes/<id>/log/<date>.md` already exists (including as a result of
a "move" in step 4), never overwrite it silently. First look at what it
is:
- **A logged session with lifting** (`status: done` and a `## Факт`/
  `## Actual` section) — the athlete already trained on that date. Don't
  plan over it; ask for another date.
- **A cardio-only day** (`status: done`, a `## Кардио`/`## Cardio` section
  and no lifting — a morning run before an evening session) — the plan
  goes into this file alongside the cardio: tell the planner in step 7 to
  add the `## Plan` section, set `status: planned` and leave the cardio
  section exactly as it is. There is nothing to replace.
- **A plan** (`status: planned`) — ask: replace the plan, extend it, or
  cancel.
- **Replace** — proceed to generate a fresh plan; the planner agent
  overwrites the file's contents in step 7.
- **Extend** — read the existing `## Plan` section now, so it can be
  passed to the planner agent in step 7 as material to add to, not
  discard; the agent edits the file rather than replacing it wholesale.
- **Cancel** — stop here. Nothing changes. Say so and end the skill.
Do not delete or truncate the existing file yourself before the agent
writes its replacement in step 7 — if that call fails (step 7's last
paragraph), the athlete's existing plan must still be exactly as it was.

## 6. Determine the session and gather statistics

Read `athletes/<id>/program.md`. If it doesn't exist — an athlete can be
registered in `.coach.json` with no programme yet, if `/coach:init`'s
specialist call was unreachable — say so and point the athlete at
`/coach:init` to finish the setup, rather than failing on a missing file.

- If a session-name argument was given in step 3 and it matches one of
  the `### <name>` headers under `## Sessions`, that is the session,
  regardless of rotation. If it matches neither a date nor any session
  name, say you don't recognize it and ask which session they mean,
  rather than guessing.
- Otherwise, look at `Meta → rotation` and the `recent` output from
  step 4: find the athlete's last `done` session — skipping rows marked
  `cardio only`, since a run on a rest day is not in the rotation, and
  rows whose session isn't a name in the rotation at all (`Imported`, a
  one-off) — and take the next name in the rotation list, wrapping to the
  first after the last. If none of the five rows qualifies, re-run
  `recent` with `--n 20` rather than guessing; if still none, ask which
  session is next.
- Before settling on either: check `Meta → block`'s current week against
  `Meta → test week`. If this is the test week and no session-name
  argument overrode it, the session is the program's `Test` session
  instead — this calls for a safety reminder (spotter, warm-up ramp)
  when the plan is shown in step 8.
- If the chosen session is the first name in `rotation`, and the last
  `done` session from the step-4 output (again not `cardio only`) was the
  *last* name in `rotation`, a full rotation cycle just completed — unless
  `program.md`'s Changelog already records a `current week` increment
  dated on or after that last `done` session: then this cycle was already
  counted (the athlete is re-planning its first session, or planning
  ahead) and the week must not move again. Work that out here —
  the planner agent should increment `current week` in `program.md`'s
  Meta and log it in the Changelog, and step 7 states this conclusion to
  the agent directly rather than handing it a rotation list to re-derive
  it from.

Once the session is known, run, for every exercise listed in that
session's table, one single call:
```
node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" exercises "<exercise 1>" "<exercise 2>" ... --athlete <id> --n 3
```
Each item carries `daysSinceLast`. An exercise last done 14 or more days
ago is a return after a break, not a normal next session: say so to the
planner in step 7, by name and gap, so it applies the programme's
return-from-break rule instead of the usual increment.

Also run:
```
node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" report --athlete <id> --since 3w --json
```
and keep its `fatigueSignals`, `stalls` and `notes` for step 7 — the
planner is asked to watch for accumulated fatigue, and these are the
signals the script already computed; never make it re-derive them from
three performances.

Also read the athlete's inventory, per the athlete-resolution rule: if
their `gym` is `own`, read `athletes/<id>/gym.md` — if that file doesn't
exist, the inventory is unknown; say so to the athlete and ask, rather
than falling back to the shared `gym.md`. If `gym` is `shared`, read the
root `gym.md`.

Also read `athletes/<id>/profile.md` — it carries the athlete's injuries,
limitations and stated preferences ("won't do X"), which constrain what
the agent is allowed to prescribe.

Also run:
```
node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" phase --athlete <id> --json
```
The athlete's current nutrition phase changes how a stall reads: in a
deficit strength usually keeps progressing — it is muscle gain the deficit
blunts — so a main-lift stall on a cut is a signal to check the rate of
loss (`phase`'s bodyweight trend) before changing the programme, not an
expected cost of dieting. That is the sourced rule the programme
designers carry. `from: null` (no `phases.md`, or nothing currently open) means
treat this the same as `maintain` with nothing else known.

Finally, from the step-4 `recent` output, find the two most recent log
files that have a non-empty Notes section (usually the two most recent
`done` or `skipped` sessions — a `skipped` session's note often carries
the reason, e.g. an injury, which matters for planning too) and open
those files to read their Notes verbatim. Fewer than two logs may
actually carry notes — pass whichever ones exist. If none do (a
brand-new athlete, or one who has never written notes), don't omit the
field or widen the search further back: tell the agent explicitly, in
step 7, that there are no recent notes.

## 7. Call the planner agent

The planner agent cannot ask the athlete anything — it works once,
autonomously, and returns a report — so its task must contain everything
it needs. Invoke it with the Agent tool, `subagent_type: coach:planner`,
and give it, explicitly, in the prompt:

- The athlete's folder path (`athletes/<id>`), their language, and their
  units (`kg` or `lb`, from `.coach.json` — an athlete's own `units`
  field if they have one, otherwise the folder's). The agent writes
  increments itself, so without this it writes them in the wrong unit.
- The chosen session's exact definition from `program.md`: its name and
  its full exercise table, row by row.
- The `Progression rules` and `Deload rules` sections of `program.md`,
  copied verbatim, not summarized — the agent applies them literally to
  each exercise.
- The full `stats exercises` output from step 6, and every exercise
  returning after a gap of 14 days or more, with its gap.
- `fatigueSignals`, `stalls` and `notes` from step 6's `report`, as they
  came — a list of what fired, never turned into a score.
- The Notes text of the last two logs, verbatim, from step 6 — or the
  explicit statement that there are none, per step 6.
- The athlete's inventory (their `gym.md` content) from step 6.
- The athlete's `profile.md` content from step 6 — this is what tells the
  agent about injuries, limitations and refused movements; never trim it
  from the package to save space.
- The athlete's current phase from step 6, alongside the profile — one
  clause stating how it changes the reading of a stall (on a cut, check
  the rate of loss before changing anything).
- The target date.
- Whether this is the test week, and if so, that it should plan the
  `Test` session with a spotter/warm-up-ramp reminder in its report.
- Whether a full rotation cycle just completed, and therefore whether to
  bump `current week` in `program.md`'s Meta and log the bump in the
  Changelog (your step-6 conclusion, stated plainly).
- If step 5 was "extend": the existing `## Plan` section content, with an
  instruction to add to it rather than replace it.
- One explicit task in one phrase: plan this session for this date and
  write it to `athletes/<id>/log/<date>.md` with `status: planned`.

The agent writes the log file itself (and edits `program.md` if a point
adjustment or a week bump applies) and returns a report in the standard
form: a first line of what it did and where, three to eight lines of
substance for the athlete in their language, and — only if something was
missing — a last line naming the gap.

**If the agent's report names something it was missing**, don't guess:
ask the athlete that one specific question, then call the agent again
with the same full package plus the answer.

**If the agent can't be reached at all** — the call fails, times out, or
the agent doesn't exist — say so plainly to the athlete and stop trying;
don't retry silently and don't write a plan yourself. Because step 5 never
deleted or truncated any pre-existing file, the athlete's previous state
(an old plan, or nothing) is exactly as it was before this skill ran —
say that explicitly, so they know nothing was left half-written.

## 8. Verify loadability, then show the plan

Before printing anything to the athlete, read the weights the agent wrote
into the log file's `## Plan` section and check each barbell and dumbbell
load with the script:
```
node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" load <kg> --athlete <id> [--dumbbell]
```
A load the script returns unchanged is buildable. One it changes wasn't:
use the script's load, edit the file, and note the correction as an extra
adjustment line when you print the plan. If the gym file has no
machine-readable plate lines, the script says so — check by the file's
prose instead, and suggest `/coach:gym` to record the plates. Machines and
cables are checked against the stack step `gym.md` names.

For the first working weight of each main barbell lift, get the warm-up:
```
node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" warmup <kg> --athlete <id>
```
and show its ramp under that lift when you print the plan — the steps are
already rounded to the athlete's plates. Accessory work gets none.

Then print the plan to the athlete, in their language, opening with their
name, the session, and the date (step 2). Include:
- The plan itself, five to ten lines.
- One line explaining every weight that changed from last time.
- A separate line for each program adjustment the agent made (an
  exercise swap, a rep-range shift, a deload, a `current week` bump, a
  plate-rounding correction from this step) — most of these should
  already be in the agent's report; relay them, don't drop them.
- If this is the test week, repeat the spotter/warm-up-ramp reminder in
  your own reply too, not only inside the file.

## 9. In-gym questions

Once a plan exists, the athlete may come back mid-session: "the bench is
taken, what instead", "no 15s left, what do I do". Answer these directly,
in the same session — do not dispatch the planner agent for this. The
athlete is standing in the gym waiting; picking a same-pattern substitute
is a lookup, not a design decision.

Find a substitute using the athlete's own inventory (`gym.md`) and the
`Substitutes` column of `${CLAUDE_PLUGIN_ROOT}/knowledge/exercises.md`,
matching movement pattern and respecting anything the athlete has said
they refuse to do. Recompute the working weight so it stays buildable
from their plates, the same check as step 8. If it will help their later
`/coach:log` match what's actually on paper, update the `## Plan` section
of that day's log file to reflect the substitution — this is a same-day
lookup, not a program change, so it does not need a `Changelog` entry.

## Rules that apply throughout

- **Never overwrite an existing file for a date without an explicit
  choice from the athlete** — steps 4 and 5.
- **Dates always come from `stats.mjs today`**, never memory or estimation.
- **Nothing this skill states about the past — weights, PRs, dates —
  comes from anywhere but `stats` output or the log files themselves.**
- **Weights in the printed plan must be buildable from the athlete's
  recorded plates**, checked in step 8 before the plan is ever shown.
- Plugin-side text (this file, the agent prompt built from it, knowledge
  references) is English; everything said to the athlete, and the plan
  file itself, is in their language.
