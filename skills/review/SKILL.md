---
name: coach-review
description: This skill should be used when the user asks "how am I progressing", "review my training", "should I change the program", "разбери прогресс", "что по прогрессу", or runs /coach:review. It analyses the period, explains what grew and what stalled, and proposes program changes for approval.
argument-hint: "[athlete] [4w | 3m | YYYY-MM-DD]"
---

# Coach Review

The periodic check-in: what grew, what stalled, whether the programme
itself should change. This is the one skill in the plugin that reopens
`program.md`'s structure, so it moves slowly — every edit is confirmed one
at a time, and every edit is logged.

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
own. Present — check its `schema` field: anything other than `1` means the
plugin and the data folder are out of sync, so say so and stop without
attempting to auto-migrate.

## 2. Resolve the athlete and the period

Per the athlete-resolution rule: the first argument, if it
case-insensitively matches an athlete's `id` or `name` in `.coach.json`,
selects that athlete; otherwise use `default_athlete`, and in that case the
first argument (if any) is not an athlete id — it's the period instead.
There is no session-level "current athlete" memory — resolve fresh every
run.

The remaining argument, if given, is the period: `Nw` (weeks), `Nm`
(months), or an ISO date (`YYYY-MM-DD`, meaning "since this date"). No
argument — default to `4w`. Don't validate the format yourself; step 4
runs it through `stats.mjs`, which rejects a malformed period with a clear
error. If that happens, relay the error and ask for a valid period rather
than guessing one.

Name the resolved athlete in the first line of the final reply ("Vera,
review, last 4 weeks") so a wrong-athlete mistake is visible immediately.

## 3. Make sure there's something to review

Run:
```
node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" recent --athlete <id> --n 1 --json
```
An empty `rows` array means this athlete has never logged a single
session — there is no history to review, not just a thin one. Say so plainly, point them
at `/coach:log` or `/coach:plan` to get started, and stop here; don't call
the analyst on nothing. A non-empty result means there's at least some
history, even if the chosen period turns out to hold little or none of it
— that case is not a stop condition, it's a finding, and it's step 4's job
to surface it honestly, not this step's job to pre-empt it.

**Phase staleness check.** Also run:
```
node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" phase --athlete <id> --json
```
Apply the same staleness thresholds the phase skill already reasons
through (`skills/phase/SKILL.md` step 3) — don't restate a different
number here. `cut` past roughly 16 weeks, or `bulk` past roughly 24, is
worth asking about before analysing anything: a stale phase misreads every
stall and every deload decision the analysis is about to make. `maintain`
has no staleness check — running it indefinitely is normal, so don't ask
about it on that basis alone. Both numbers are practical defaults for
catching a forgotten phase file, not sourced thresholds; say so if asked.
If the athlete confirms an aged cut or bulk is still accurate, proceed
normally. If they say it's actually changed, point them at `/coach:phase
<new phase>` to update it first, since this skill does not write
`phases.md` itself; once they've updated it (or say to proceed anyway),
continue to step 4.

## 4. Run the report

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" report --athlete <id> --since <period>
```
This is the factual base for everything that follows: PRs achieved in the
period, a growing/stalled/falling/insufficient-data verdict per main lift,
weekly volume by muscle group and by exercise tonnage, session frequency
against the athlete's `days_per_week`, and any fatigue-signal observations
(RPE rising at a fixed load, smoothed e1RM or reps falling, `feel`
dropping, sessions skipped) — printed as a list of what fired, never as a
single fatigue score; none is computed, and none should be invented later
in this run either. When the logs carry them, it also lists the period's
failed sets with where each stopped (`Misses:`), weekly cardio totals
(`Cardio:`), and every cardio entry on a lifting day with its gap to the
session in hours (`Cardio on lifting days:`) — the analyst needs that last
block to tell cardio interference from accumulated fatigue.

Keep this output verbatim — it goes into the analyst's package in step 6
and into the review file in step 10 unedited.

## 5. Gather the rest of the package

- Read `athletes/<id>/program.md` verbatim: Meta, Progression rules,
  Deload rules, Sessions, and the existing Changelog. If it doesn't exist
  — an athlete can be registered with no programme yet, if `/coach:init`'s
  specialist call was unreachable — say so and point at `/coach:init` to
  finish setup, rather than reviewing a programme that isn't there.
- Read `athletes/<id>/profile.md` verbatim — goal, training age,
  limitations, schedule, preferences, the methodology and why.
- If the profile is stale — run `report` again with `--json` and read
  `profile.stale`, which is true when nobody has confirmed it for eight
  weeks or more, when it has never been confirmed, and when there is no
  `profile.md` at all (the text report words those three differently) —
  ask before calling the analyst: this is the one moment the athlete's
  attention is already here. One AskUserQuestion, three things
  only: injuries or pain that changed, schedule, and anything they now
  refuse to train. Their words go into `profile.md` verbatim, under the
  fields they belong to, by the same rule that governs limitations —
  never your paraphrase. Then add one dated line to `## Checked`
  (`## Проверено`), in exactly this shape: `- YYYY-MM-DD — confirmed, no
  changes` (or what changed), with today's date from `stats.mjs today`. If they don't want to answer,
  add nothing — an unconfirmed profile is honest, a profile dated without
  a confirmation is not. Whatever changed goes into the analyst's package
  with everything else; a modifier the athlete just corrected must not
  reach the specialist in its stale form.
- Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" recent --athlete <id>
  --n 4` and open each of the (up to four) listed log files, reading each
  one's Notes section verbatim. Fewer than four files existing is normal
  for a newer athlete — pass whichever exist. If a listed file's Notes
  section is empty, say so for that date rather than dropping it silently.
- Don't look the period's phase up again here — step 4's `report` output
  already carries it, honestly, as its own `phase` field: a single phase
  when one covered the whole period, or `mixed: true` plus every segment
  and which one dominated by day count when the period spans a change.
  Looking it up a second way (e.g. `phase --at <period start>`) would only
  name whichever phase happened to be open at the period's first moment,
  which is exactly the wrong-end reading the report's own `phase` field
  exists to avoid — reuse that field in step 6 instead of re-deriving it.
- Work out which of the modifiers every programme specialist carries
  (sex, age 40+, caloric deficit, limited equipment, cardio in the
  schedule, returning after a break) currently apply. `program.md`'s
  Changelog is the record of what was applied at init or a past review —
  start there, and cross-check against `profile.md` (goal, schedule,
  limitations) and `.coach.json` (`gym: own` with a sparse inventory can
  mean limited equipment). Pass only the ones that actually apply now; a
  stale modifier padded into the package is as misleading as a missing one.

## 6. Call the analyst agent

The analyst does not write anything — this call is analysis and proposals
only. State that explicitly in its task, because the agents' usual
contract has them write their own output file, and an agent left to assume
that default here would try to edit `program.md` itself, bypassing the
athlete's per-item consent this skill exists to enforce. Every write to
`program.md` in this skill happens in step 8 or step 9, never inside this
call.

Invoke it with the Agent tool, `subagent_type: coach:analyst`, and give it,
explicitly, in the prompt:

- The athlete's folder path (`athletes/<id>`), their language, and their
  units (`kg` or `lb`, from `.coach.json` — an athlete's own `units`
  field if they have one, otherwise the folder's). The agent writes
  increments itself, so without this it writes them in the wrong unit.
- The full `report` output from step 4, verbatim — including its
  `Bodyweight:` line when one is present. That line is the measured trend
  and, where the phase's target rate parsed, the verdict against it; it
  replaces judging the weight trend by eye.
- `program.md`'s content from step 5, verbatim.
- `profile.md`'s content from step 5, verbatim.
- The Notes text of the last four logs from step 5, verbatim — or the
  explicit statement that there are fewer than four, or none.
- The report's own `phase` field from step 4 — state plainly that this is
  the phase (or phases, if `mixed: true`) that covered the reviewed
  period, not necessarily the athlete's phase today, so the analyst
  reasons from the right one. If it's mixed, pass every segment and which
  one dominated, not just the dominant phase's name — a period split
  between a deficit and maintenance explains a stall very differently than
  either phase alone would.
- The modifiers that currently apply, from step 5.
- The report format to use, since it differs from the agents' usual one:
  a short analysis for the athlete (what grew, what stalled, what's
  uncertain and why — carrying forward the report's own qualifications:
  "insufficient data" stays "insufficient data", an RPE-driven read is
  flagged when RPE has gone unreliable, fatigue signals are named as
  observations, never scored), followed by a numbered list of proposed
  `program.md` changes. Each proposal states the change, the reason, and
  whether it is a **point** change (load, rep range, an accessory swap, a
  deload) or a **structural** one (a new block, a different methodology, a
  different split, a change to which lifts are main) — this label decides
  which of step 8 or step 9 applies to it. If nothing warrants changing,
  say so instead of inventing proposals to fill the list.
- One explicit task in one phrase: analyse this period against the
  programme and knowledge base, and return the analysis and proposals —
  do not write to any file.

**If the analyst can't be reached** (the call fails, times out, or the
agent doesn't exist), say so plainly to the athlete and stop trying —
don't retry silently and don't attempt the analysis yourself. Nothing has
been written yet at this point, so nothing needs to be rolled back; tell
the athlete that plainly too.

## 7. Show the analysis and the proposals

Print the analyst's analysis to the athlete first, in their language, with
its qualifications intact — a trend it called "insufficient data" is
reported as insufficient data, not smoothed into a confident read for the
sake of a tidier reply.

Then print the numbered list of proposals exactly as returned, each with
its reason and its point/structural label. If the analyst proposed
nothing, say so and skip to step 10 — there is nothing to confirm.

## 8. Confirm and apply each point change

Ask about each **point**-labelled proposal separately, and wait for an
answer that addresses that specific item before moving on. A single "yes"
to the whole list is not consent for any one of them — restate the item if
an answer is ambiguous about which proposal it covers, and don't apply
it until that's resolved. An item the athlete never answers is left
unapplied, not treated as declined; note it as undecided in step 10 rather
than silently dropping it.

For each approved point change: edit `program.md` yourself (this skill
writes it, the analyst didn't) and append one dated line to its
`Changelog`:
```
- <date> review: <what changed>, because <reason>.
```
Apply changes one at a time, in the order presented — if something
interrupts the run partway through, whichever changes were already
confirmed and applied stay applied and logged; nothing partially-answered
gets guessed at.

**Structural**-labelled proposals are not edited here — go to step 9 once
the athlete has approved that specific proposal (the same per-item
confirmation rule applies to it as to any other).

If every proposal is declined, say so plainly in step 10's summary:
`program.md` is unchanged, and that is itself the outcome of this review,
not a failure of it.

## 9. Route a structural change to a program specialist

A structural change is not the analyst's to write, and it isn't this
skill's to improvise either — it goes to whichever program specialist
would own this athlete's programme, using the same routing rule `init`
uses:

1. Training age under a year of systematic training, or no barbell
   experience → `program-beginner`.
2. Goal is strength, or there's a competition date → `program-strength`.
3. Goal is size, shape, or a specific muscle focus → `program-hypertrophy`.
4. Goal is both strength and size → `program-powerbuilding`.

Say out loud which specialist you're about to call and why, and offer to
use a different one if the athlete disagrees — borderline cases are the
athlete's call, exactly as in `init`.

Consent at step 8 was to the analyst's *description* of the change ("move
to a new block", "switch methodology") — not to the concrete programme the
specialist is about to write. The agent contract gives the specialist the
write role, so it will write `program.md` the moment it's called; this
skill's job is to make sure the athlete still sees the actual edit and can
still refuse it once it exists, rather than treating the earlier consent
as covering whatever the specialist produces.

**Before calling the specialist**, copy the athlete's current
`program.md` to a sibling backup in the same folder —
`athletes/<id>/program.md.review-backup` — overwriting any leftover backup
from an earlier structural change in this same run. This is this skill's
own working file, not the athlete's; it exists only until this proposal
is resolved, below.

Invoke the chosen agent with the Agent tool, `subagent_type:
coach:program-<kind>`. It cannot ask the athlete anything, so give it,
explicitly, in the prompt:

- The athlete's folder path (`athletes/<id>`), their language, and their
  units (`kg` or `lb`, from `.coach.json` — an athlete's own `units`
  field if they have one, otherwise the folder's). The agent writes
  increments itself, so without this it writes them in the wrong unit.
- `program.md`'s current content from step 5, verbatim — it revises this
  programme, it does not design a new one from nothing.
- `profile.md`'s content from step 5, verbatim — including the
  Limitations and injuries field exactly as written there, never
  re-summarized into your own words when you compose this prompt
  (`${CLAUDE_PLUGIN_ROOT}/knowledge/safety.md` §6: a paraphrase already
  carries a classification the specialist can't recover).
- The approved structural proposal and its reason, verbatim, from the
  analyst's output.
- The full `report` output from step 4, verbatim — including its
  `Bodyweight:` line when one is present. That line is the measured trend
  and, where the phase's target rate parsed, the verdict against it; it
  replaces judging the weight trend by eye.
- The athlete's inventory, per the athlete-resolution rule: `gym: own` →
  `athletes/<id>/gym.md`; `gym: shared` → the root `gym.md`.
- The modifiers that currently apply, from step 5.
- One explicit task in one phrase: revise this athlete's programme to
  carry out this specific structural change, and write the update to
  `program.md`, including a dated `Changelog` line explaining it.

The agent writes `program.md` itself, per the usual agent contract, and
returns the usual short report.

**Verify the Changelog before trusting it.** The agent was told to append
a dated line; check that it actually did, the way `plan` reads the
planner's output back rather than trusting it blind. Compare the new
`program.md`'s `Changelog` against the backup's — if the expected line
for this change isn't there, add it yourself before going any further, so
the edit is never left unrecorded.

**Show the athlete the actual edit, then let them refuse it.** Diff the
backup against the new file (`diff -u
athletes/<id>/program.md.review-backup athletes/<id>/program.md`, or read
both and compare) and describe in prose what changed in the Sessions,
Progression rules, Deload rules, and Meta blocks — the real programme, not
only the specialist's own summary of itself. Then say plainly that they
can reject it:
- **Accept** — delete `athletes/<id>/program.md.review-backup`. The edit
  stands as written and logged.
- **Reject** — copy the backup back over `program.md`, then append one
  more dated `Changelog` line to the restored file recording that this
  change was proposed and declined (with the athlete's reason, if given),
  then delete the backup. The history shows a change was proposed and
  declined, not that nothing happened.

**If the specialist can't be reached**, say so plainly and don't retry.
Delete the backup (nothing was written, so there's nothing to restore) and
leave `program.md` exactly as it is: any point changes already applied in
step 8 stay applied, and this structural change is simply not made. Note
in step 10 that it was approved but not carried out for this reason, so a
later review or a manual retry isn't reviewing something that silently
already happened.

## 10. Write the review file, then summarize

Get this week's label from `node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" week`
(e.g. `2026-W39`). If
`athletes/<id>/reviews/<week>.md` already exists — a second review run in
the same week — ask whether to replace it or save this one under a
suffixed name instead; don't overwrite a same-week review silently.
Otherwise create `athletes/<id>/reviews/` if it doesn't exist yet and write
the file with:

- The period covered and today's date.
- The raw `report` output from step 4, verbatim.
- The analyst's full analysis and numbered proposals, verbatim.
- The decision on each proposal: applied (with its Changelog date),
  declined, undecided (never answered), rejected-after-review (approved at
  step 8, shown as a concrete edit, then refused — step 9), or approved-
  but-specialist-unreachable — and the specialist's report in full, if
  step 9 ran.

Then print a short summary to the athlete, in their language, opening with
their name (step 2): what grew and what stalled, with the same
qualifications carried through from step 7, what changed in the programme
and why, and a pointer to the review file for the full detail. If step 5
checked a stale profile, say so in one line — how long it had gone
unconfirmed (`profile.weeksAgo`, or "since setup") and what was recorded:
confirmed with no changes, or what changed. The athlete should know the
programme is being judged against a profile they just vouched for. This is the
one skill allowed a longer reply than the plugin's usual one-to-three
lines — the detailed version belongs in the file, not in the chat, but the
chat summary should still be a summary, not a repeat of the whole
analysis.

## Rules that apply throughout

- **Nothing is written to `program.md` without a confirmation on that
  specific proposal** — no batching a "yes" across the list, no applying
  anything left unanswered.
- **The analyst never writes a file.** Every point edit in this skill is
  made by this skill; every structural edit is made by the program
  specialist in step 9 — never by the analyst.
- **Every edit to `program.md`, point or structural, gets a dated
  `Changelog` line stating what changed and why.** An edit without one is
  not considered done. For a structural edit, verify the specialist
  actually added the line — don't trust it unread.
- **A structural edit is shown to the athlete as the concrete change it
  is, with a real chance to reject it, before it's treated as final** —
  the consent at step 8 is to the analyst's description, not to whatever
  the specialist happens to write.
- **Dates come from `stats.mjs today`**, and the review filename's week label
  from `stats.mjs week` — never memory or estimation.
- **A qualification on the evidence is carried through to the athlete, not
  smoothed away** — "insufficient data" is said as insufficient data, an
  RPE-based read is flagged when RPE has gone unreliable, and fatigue
  signals are reported as the observations they are, never as a score.
- Plugin-side text (this file, the agent prompts built from it) is
  English; everything said to the athlete, and the review file itself, is
  in their language.
