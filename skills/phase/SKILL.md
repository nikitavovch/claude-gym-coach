---
name: coach-phase
description: This skill should be used when the athlete asks about or wants to change their nutrition phase — "what phase am I in", "какая у меня фаза", "switch to a cut", "I'm bulking now", "перешёл на сушку", "я на массе", "поддержание", or runs /coach:phase. It reports the current phase (and the one before it) or closes the open phase and starts a new one.
argument-hint: "[athlete] [cut | bulk | maintain] [date]"
---

# Coach Phase

Tracks whether the athlete is cutting, bulking, or maintaining, in
`athletes/<id>/phases.md`. This file exists because the phase changes
how everything else in this plugin reads: in a deficit,
strength usually keeps progressing — it is muscle gain the deficit
blunts — so a main-lift stall is a signal to check the rate of loss
before changing the programme, not an expected cost of dieting (the
sourced rule every programme designer carries). A coach that
doesn't know the phase gives confident advice from a false premise — every
other skill reads this file (or `stats brief`/`stats report`, which already
carry it) to avoid that, so keeping it current here is what makes their
advice trustworthy.

This document is written in English, for the model. Everything the coach
says to the athlete during a run is in the athlete's own language.

Plugin files — the statistics script, anything under `knowledge/` or
`agents/` — are addressed by their full path, which Claude Code fills in
before this text is read. The athlete's own files (`.coach.json`,
`athletes/<id>/...`) are relative to the working directory, which during a
run is the athlete's data folder, not the plugin. A skill that gets this
backwards cannot find a single file at runtime.

Take today's date from running `node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" today`.
Never state a date from memory.
This skill never computes a date itself beyond that — closing a phase
needs "the day before a given date", and that arithmetic lives, tested,
in `phase set` (step 4.3), not in this document. Two other date bugs have
already reached this project inline (a Cyrillic word boundary, then month
arithmetic at the 31st); a third one isn't getting written into a skill's
prose.

## 1. Guard

Check for `.coach.json` in the working directory. Missing — tell the
athlete to run `/coach:init` and stop; this skill creates nothing on its
own. Present — check its `schema` field: anything other than `1` means the
plugin and the data folder are out of sync, so say so and stop without
attempting to auto-migrate.

## 2. Resolve the athlete and the request

Per the athlete-resolution rule: the first argument, if it case-insensitively
matches an athlete's `id` or `name` in `.coach.json`, selects that athlete;
otherwise use `default_athlete`, and in that case the first argument (if
any) is not an athlete id. There is no session-level "current athlete"
memory — resolve fresh every run.

Name the resolved athlete in the first line of the final reply ("Vera,
phase") so a wrong-athlete mistake is visible immediately.

What's left of the arguments (after any athlete-id argument was consumed)
decides the mode:

- **Nothing left** — report mode (step 3).
- **One token that names a phase** — `cut`, `bulk`, `maintain`, or a
  recognized synonym (`сушка`/`деф`/`дефицит` → cut; `масса`/`набор` → bulk;
  `поддержание`/`поддерживаю` → maintain; case-insensitive) — switch mode
  (step 4), starting today.
- **Two tokens, the second a `YYYY-MM-DD` date** — switch mode, backdated to
  that date (step 4).
- **A token that names none of the three phases** — don't guess which one
  was meant; name the three valid values and ask.

When this skill is triggered by free-form conversation instead of the
literal `/coach:phase` command ("я перешёл на сушку", "switching to a
bulk"), there are no positional arguments to parse — read the intended
phase (and any date the athlete mentioned) out of what they actually said,
the same way `/coach:log` reads dictated sets out of free text. If the
athlete's own words name a reason ("на сушку — до свадьбы в декабре"),
carry that into the `Note` column in step 4.4; don't ask for a reason
separately, that's a question this flow doesn't call for.

## 3. Report mode

Run:
```
node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" phase --athlete <id> --json
```
This is the open phase: `phase`, `from`, `weeks` running, and
`targetRate` if one was recorded. When bodyweight has been logged,
`bodyweight.trend` holds the measured trend since the phase opened —
`perWeek` in the athlete's units and `pctPerWeek` — and
`bodyweight.verdict` a verdict against the target where it could be read
as a number (`on track`, `faster than target`, `slower than target`,
`wrong direction`); `bodyweight.flags` holds anything worth saying on top
(losing faster than 1%/wk, a target in other units than the log). Report
those as they come: never recompute the rate from the logs yourself, and
never call a trend on-target or off-target when `verdict` is null — an
unreadable target ("about half a kilo", or a number with no sign) is
exactly the case where the number is not yours to invent.
`bodyweight.trend.enough: false` means fewer than three weights, or all of
them inside a fortnight; say that plainly rather than estimating from
two. `from: null` means either `phases.md` doesn't
exist for this athlete (most people never log phases — say plainly that
none is recorded, and that the default assumption elsewhere is
maintenance) or a row could not be resolved to anything currently open;
either way there's nothing further to report here.

For the *previous* phase, read `athletes/<id>/phases.md` directly (it's a
short table, safe to read whole) and take the row immediately below the
open one — the row right after it in the file, since rows run newest first.
No file, or only one row, or no information to work with — say there's no
earlier phase recorded rather than guessing at one.

To state how long that previous phase ran, don't subtract the dates
yourself — run:
```
node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" phase --athlete <id> --at <that row's To> --json
```
Querying `--at` its own closing date returns that row with `weeks` set to
its full duration, computed the same tested way every other date figure
in this plugin is. State its phase, its start date, and this `weeks` value.

**Staleness check — run this every time a current phase is reported.** If
the open phase is `cut` and `weeks` exceeds roughly 16, or `bulk` and
`weeks` exceeds roughly 24, say so plainly before moving on: name how long
it's actually run, note that this is longer than usual for that phase, and
ask whether it's still accurate or whether it should be closed now (using
switch mode, step 4, with today's date or a date the athlete supplies).
These two numbers are practical defaults for catching a forgotten phase
file, not sourced thresholds — say so if the athlete asks why. `maintain`
has no staleness check; running it indefinitely is normal.

## 4. Switch mode

First, run the same `phase --athlete <id> --json` call as step 3 to learn
the currently open phase, if any.

**Already on the requested phase.** If `from` is not null and its `phase`
already equals the requested one, this is not an error: say plainly that
the athlete is already on it, name the recorded start date and how long
it's run, and offer to correct the start date instead of opening anything
new. If they want that, ask for the correct date and run step 3's
`phase set` with the same phase and that `--from`: the script answers
`action: "corrected"`, changes only the row's `From`, keeps its rate and
note, and refuses a date that would overlap the phase before it. Never
edit the row by hand. If they don't, stop here; nothing changes.

**Otherwise**, this is a genuine switch (or the athlete's first-ever phase
entry). This skill does not touch `phases.md`'s rows for this case — it
asks the one question that needs a person, then hands the write to the
tested `phase set` subcommand:

1. Ask, in one question with AskUserQuestion, for a target rate. Every
   option is one signed number the script can compare with the measured
   trend — a range, or a number without its sign, never gets a verdict:
   - Switching to **cut**: offer `-0.5%/wk` (the gentle end of the usual
     0.5–1% a week) and `-1%/wk` (the fast end), alongside "не знаю / not
     sure".
   - Switching to **bulk**: offer `+0.25%/wk` and `+0.5%/wk` (the usual
     range's two ends), alongside "не знаю / not sure".
   - Switching to **maintain**: offer `0%/wk`, alongside "не знаю / not
     sure".
   These ranges are the same starting points the nutrition agent uses
   (`${CLAUDE_PLUGIN_ROOT}/agents/nutrition.md` §2) — offered here as options,
   not computed. If the athlete answers with their own number, record it
   verbatim — with the sign the phase implies when they gave none (a cut
   loses, a bulk gains), said back to them so they can correct it. A range
   they insist on is recorded as said; `phase set` then warns that it can
   never be judged, and you pass that on. If they answer "не знаю" or
   decline, send no rate at all (`{}` in step 3) — don't press for a
   second answer; the column is optional for exactly this reason.
2. `newFrom` = the date argument from step 2 (if any). If a given date is
   after today, that's not a backdate — confirm with the athlete before
   using it, since this file's whole value depends on the dates being
   right. If no date was given, omit `--from` entirely and let the command
   default to today.
3. Run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" phase set <phase> [--from <newFrom>] --athlete <id> --json --stdin <<'COACH_JSON'
   {"rate": "<answer, verbatim>"}
   COACH_JSON
   ```
   The rate is the athlete's own words, so it travels as JSON in a quoted
   heredoc the shell never expands; with no rate, send `{}`.
   This closes whatever was open — its `To` set to the day before the new
   start, computed by the script, never by this skill — and opens the new
   row; on a first-ever entry it creates `phases.md` from nothing. If it
   reports more than one row was open before this call (a warning from
   step 3/4's earlier `phase --json` read), don't run this against an
   already-broken file — show the athlete the warning and ask them to fix
   or pick the real open row first.
   - **If the command exits non-zero**, show the athlete the message and
     don't retry the same call. The usual causes: a `--from` before the
     currently open phase's own start (it would leave that phase a
     negative-length row) — ask for a later date; or a row in `phases.md`
     the parser cannot read — the file needs fixing first, since a write
     around an unreadable row could leave two phases open.
   - **If the result's `action` is `"replaced"`**, the given date was the
     open phase's own start date: that row was relabelled rather than
     closed. Say which phase it replaced (`replaced`), since its rate and
     note went with it.
   - **If the result carries `warnings`**, pass them on as they are — most
     often a target rate that can never be judged.
   - **If the result's `action` is `"noop"`**, the athlete's answer landed
     on exactly the phase and date already open despite the check above —
     treat this the same as the "already on the requested phase" branch.
4. If the athlete's own words named a reason for the switch (step 2's
   note about `Note`), add it to the new row's `Note` cell now with a
   direct edit — `phase set` has no `--note` flag, and this is a plain
   text cell, not a date, so no arithmetic is involved in writing it.

## 5. Verify, then reply

Before replying, run `phase --athlete <id> --json` once more and confirm
`warnings` is empty and the reported `phase`/`from` match what was just
written — don't trust the edit unread, the same way `/coach:plan` verifies
the weights it wrote before showing them. A non-empty `warnings` array
means the edit produced a malformed or overlapping file; show the athlete
exactly what it says and fix the row rather than reporting success anyway.

Then reply, opening with the athlete's name (step 2):
- What changed: old phase → new phase (or "no earlier phase" for a first
  entry), and the start date.
- The target rate that was recorded, or that none was given.
- One short line on what this changes going forward — on a cut, a stall
  on a main lift sends the coach to the rate of loss first; on a bulk or
  back at maintenance, the usual progression applies. Keep this to the
  one line the rationale at the top of this file already states; don't
  re-derive new advice here.

## Rules that apply throughout

- **Never silently pick a phase when the wording is ambiguous** — step 2's
  last bullet: name the three values and ask.
- **Switching to the phase already open is not an error** — offer the
  start-date correction instead of treating it as nothing to do.
- **Dates always come from `stats.mjs today` or another `stats.mjs` call**,
  never
  memory or estimation, and never from arithmetic done in this document —
  `phase set` computes the closing date, `phase --at` computes a phase's
  duration; this skill does neither itself.
- **A closing date always follows from the new phase's start date**, not
  from "yesterday" relative to today — the two are the same only when the
  athlete isn't backdating, and either way `phase set` is what computes it.
- **The staleness thresholds (16 weeks cut, 24 weeks bulk) are practical
  defaults, not sourced numbers** — say so if asked, and never upgrade them
  to a hard rule in the reply.
- **The edit is verified by reading `phase --json` back**, not trusted
  because the write call didn't error.
- Plugin-side text (this file) is English; everything said to the athlete,
  and `phases.md` itself, follows the plugin's data conventions
  (English keys, any language in `Note`).
