---
name: coach-init
description: This skill should be used when the user asks to "set up the coach", "start the gym coach", "add an athlete", "настроить тренера", "добавить подопечного", or runs /coach:init. It creates the coach data folder, interviews the athlete, chooses a training methodology together with them, records the gym inventory, and writes the starting program.
argument-hint: "[athlete id]"
---

# Coach Init

Runs the one-time onboarding for a new coach data folder, or adds/redoes an
athlete inside an existing one. This is the only skill allowed to create
`.coach.json` or an athlete's `profile.md` from scratch. Gym inventory
files are written here and by `/coach:gym`, which edits one later or
creates an athlete's own when they move to a gym of their own.

This document is written in English, for the model. Everything the coach
says to the athlete during onboarding is in the athlete's own language —
ask for that language in the first minute and switch to it immediately.

Take today's date from running `node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" today`.
Never state a date from memory.

Plugin files — templates, knowledge, docs — are addressed by their full path, which Claude Code fills in
before this text is read; the athlete's
own files (`.coach.json`, `exercises.md`, `athletes/...`) live in the
working directory and are addressed with plain relative paths.

## 1. Detect the situation

Run `ls -a` in the working directory first. There are exactly three cases,
and picking the wrong one silently destroys someone's history — decide
carefully before doing anything else.

**A. No `.coach.json` in the listing.** This is a brand-new coach folder.
Go to §2 (full setup), then run the athlete onboarding in §3–§7 for the
first athlete.

**B. `.coach.json` exists, and the skill was invoked with an id
(`/coach:init <id>`) that is NOT a key in that file's `athletes` object.**
This is a new athlete joining an existing folder. Skip §2. Run the athlete
onboarding in §3–§7 for this id, then add it to `.coach.json` under
`athletes` as `{ name, language, days_per_week, gym, motivation }` —
`name`, `language`, `days_per_week`, and whether to switch on
`motivation` come straight from the §3 interview answers; `gym` is
`shared` or `own` per §5. Do not change `default_athlete`. If this
athlete trains in units other than the folder's, add a `units` field to
their record too — it overrides the folder's for them alone, the same
way `language` does.

**C. `.coach.json` exists, and either no id was given or the given id IS an
existing key in `athletes`.** Do not silently proceed. Ask the athlete,
with AskUserQuestion, to choose one of:
- **Add a new athlete** — ask for their id (a lowercase latin slug, no
  spaces; this becomes their folder name under `athletes/`), then run §3–§7
  for it and add it to `.coach.json` with the fields listed in branch B
  above.
- **Redo an existing athlete's onboarding** — if there is more than one
  athlete, ask which one (default to the id that was passed, if any).
  Re-run §3–§7 for that id. `log/` and `reviews/` are never touched by this
  path; only `profile.md`, `program.md`, and (if the athlete has their own
  gym) their `gym.md` are candidates for replacement, and only with the
  confirmation required by the "never overwrite" rule below.
- **Stop** — say nothing was changed and end the skill.

Whenever `.coach.json` is read (branches B and C), check its `schema`
field first. Anything other than `1` means the plugin and the data folder
are out of sync — tell the athlete to update the plugin or migrate the
data folder, and stop. Do not attempt to auto-migrate.

## 2. Full setup (branch A only)

1. Ask, one question at a time with AskUserQuestion: which language to use
   for replies, and which units — `kg` or `lb`. The coach can talk in any
   language, but its files — section headings, templates, exercise names —
   exist in English and Russian only, and the log parser reads only those
   headings; a folder in any other language gets English files. Say so
   when the athlete picks another language.
2. Create `.coach.json` from `${CLAUDE_PLUGIN_ROOT}/templates/<lang>/coach.json`,
   filling `language`, `units`, and `created` (today's date via `stats.mjs today`).
   `default_athlete` and `athletes` stay empty for now — they are filled
   in once the first athlete's onboarding (§3–§7) completes.
3. Create the shared `exercises.md` from
   `${CLAUDE_PLUGIN_ROOT}/templates/<lang>/exercises.md`.
4. Create the `athletes/` folder.
5. Continue straight into §3 for the first athlete. Once §3–§7 finish, add
   the athlete under `athletes` (same fields as in §1 branch B) and set
   `default_athlete` to that athlete's id in `.coach.json`.

## 3. Interview

One question per message. Use AskUserQuestion with concrete options
wherever the answer is a small closed set; leave it open-ended otherwise.
Ask in this order:

1. Name, and how they want to be addressed.
2. Language for their replies and files (skip if already answered in §2
   for the first athlete), and, for an athlete joining an existing folder,
   whether they train in the folder's units or in the other one (`kg` or
   `lb`) — the answer goes into their own `units` field only when it
   differs.
3. Age. **Under 18: stop here** — this coach is built for adults
   (`${CLAUDE_PLUGIN_ROOT}/knowledge/safety.md` §10); say so kindly,
   suggest a qualified coach working with them in person with a parent or
   guardian involved, and write nothing.
4. Sex, as it matters to programming (loading increments, some
   modifiers), and bodyweight if they know it — both may be declined.
5. The health screen: the seven questions of `knowledge/safety.md` §8, in
   one message as plain yes/no questions, plus whether they are pregnant
   or gave birth in the past six months. Apply §8 and §10 exactly as
   written: a yes to chest pain, fainting or dizziness, or medically
   supervised activity only — or a pregnancy or recent birth without a
   clinician's clearance — means no programme yet; write `profile.md`
   with the answers verbatim, say plainly what clearance is needed, and
   stop after §7. Any other yes is recorded verbatim and reaches the
   specialist in §6, which programmes conservatively.
6. Whether to turn on short motivational lines in the coach's replies
   (`motivation: true`/`false`).
7. Goal — offer strength / size (hypertrophy) / both / general fitness as
   options.
8. Training age — how long and how systematically they've trained, and
   whether they have barbell experience.
9. Rough current working weights on the main lifts, or "no idea" — if they
   don't know, tell them the first session will calibrate the numbers
   instead of guessing.
10. Days per week and session length.
11. Injuries and limitations, in their own words.
12. Anything else the coach should know.
13. What they enjoy training and what they refuse to do.

Record every answer verbatim; they get passed on unmodified later and
written into `profile.md`.

## 4. Choose the methodology together

This is a conversation, not a menu pick. Using what the interview
revealed, propose two or three methodologies that plausibly fit — each
with a one- or two-line trade-off (what it's good at, what it costs in
time or fatigue tolerance). Drop anything that clearly doesn't fit with a
single line of reasoning ("ruled out: X needs 5 days, you have 3").
Present your recommendation first. The athlete picks one, asks to combine
elements of two, or pushes back — follow their call once they've decided.

Write the decision and the reasoning behind it into `profile.md` in §7.
This is the record that later lets `review` know why the program looks
the way it does.

## 5. Gym inventory

Ask for this only in two cases: this is the folder's first athlete, or the
athlete says they train somewhere other than the gym the existing
athletes share. Otherwise, before asking, check first with AskUserQuestion:
"Does `<name>` train at the same gym as `<the athlete(s) who share one>`?"
- Yes → this athlete's `gym` is `shared`; nothing to write, the root
  `gym.md` already covers them.
- No → ask them to describe their gym (text or photos), write
  `athletes/<id>/gym.md`, set `gym` to `own`.

When actually writing a gym file (first athlete, or `own`), always record:
bar weights, the smallest plate jump (the smallest loadable increment),
dumbbell range and step, and the machines that matter for this athlete's
training. Use `${CLAUDE_PLUGIN_ROOT}/templates/<lang>/gym.md` as the section
structure, and fill its three machine-readable lines with the athlete's
real numbers — `- bar:`, `- plates:` (every plate they have in pairs,
heaviest first) and `- dumbbells: <lightest>–<heaviest> step <step>`
(`гриф`, `блины`, `гантели … шаг` in Russian): `stats.mjs load` and
`warmup` round every load in every plan from those lines. A value the
athlete doesn't know stays out; never guess one.

## 6. Call the program specialist

Route to a specialist by this rule:

1. Training age under a year of systematic training, or no barbell
   experience → `program-beginner`.
2. Goal is strength, or there's a competition date → `program-strength`.
3. Goal is size, shape, or a specific muscle focus → `program-hypertrophy`.
4. Goal is both strength and size → `program-powerbuilding`.

Say out loud, before calling anyone, which specialist you're about to call
and why ("this sounds like a strength goal with a meet in mind, so I'll
bring in the strength specialist") — and offer to use a different one if
the athlete disagrees. Borderline cases are the athlete's call, not a
silent default.

Invoke the chosen agent with the Agent tool, `subagent_type`
`coach:program-<kind>` (matching the agent names above). The agent cannot
ask the athlete anything — it does its work once, autonomously, and
returns a report — so the call must contain everything it needs:

- The athlete's folder path (`athletes/<id>`).
- Their language, and their units (`kg` or `lb` — the folder's, or their
  own from §3) — the agent writes increments itself and must write them
  in that unit.
- The health-screen answers from §3, verbatim, whenever any was a yes —
  the agent programmes conservatively on them as
  `${CLAUDE_PLUGIN_ROOT}/knowledge/safety.md` §8 says.
- The interview answers from §3, verbatim (there is no `program.md` yet,
  and `profile.md` doesn't exist yet either — this is the raw material).
- The methodology decision and reasoning from §4.
- The gym inventory from §5 (their own file if they have one, otherwise
  the shared `gym.md`).
- Whichever of the specialists' modifiers actually apply to this
  athlete: sex, age over 40, training in a caloric deficit, limited
  equipment, cardio in the weekly schedule, returning after a break. Pass
  only the ones that apply; don't pad the call with modifiers that don't.
- One explicit task, in one phrase: design this athlete's initial program
  for the chosen methodology and write it to `athletes/<id>/program.md`.

There is no `stats` output to pass — a brand-new athlete has no training
history yet.

**Safety.** The gating rules in `${CLAUDE_PLUGIN_ROOT}/knowledge/safety.md`
(pain protocol, method-gating thresholds, rate-of-progression limits)
constrain what the specialist is allowed to program, and every specialist
reads that file. The athlete's stated injuries and limitations from §3
must reach the agent exactly as the athlete phrased them — don't
summarize or drop detail from that part of the interview package, since
it's what the gate runs against.

The agent writes `program.md` itself and returns a short report: what it
did and where, a handful of lines of substance for the athlete in their
own language, and — on the last line, only if true — what it was missing.

**If the specialist can't be reached** (call fails, times out, or the
agent doesn't exist), say so plainly and stop trying — do not retry
silently or fall back to writing a program yourself. Keep everything
already written (interview answers, methodology decision, gym inventory)
exactly as it is; do not roll anything back or treat this as grounds to
redo onboarding. Continue to §7 and write `profile.md` as normal, then
tell the athlete in §9 that their profile and inventory are saved and the
programme can be generated separately once the specialist is available —
the folder must be left in a state where a later, successful call
finishes the job, not one where rerunning `init` is the only way forward.

## 7. Show the result, then write profile.md

Print the agent's report to the athlete, in their language: the
methodology and why it was chosen, the weekly layout, and the progression
rule in one sentence.

Then write `athletes/<id>/profile.md` yourself, from
`${CLAUDE_PLUGIN_ROOT}/templates/<lang>/profile.md`, using the interview
answers from §3. Include the methodology decision and
its reasoning from §4 — this file is the one place that record is meant
to live long-term, independent of `program.md`'s changelog.

Close it with the first line of the `## Checked` section (`## Проверено`
in the Russian template), in exactly this shape: `- YYYY-MM-DD — filled in
at setup`, with today's date. Every
program specialist later reads this file's modifiers — injuries,
schedule, preferences, age — as current fact, and `review` uses that date
to know when to ask whether they still are. A profile with no dated line
reads as never confirmed.

## 8. Verify before declaring success

Before telling the athlete everything is ready, check the program the
agent wrote:

- **Every exercise in `program.md` exists in `exercises.md`.** Anything
  missing gets added there with aliases (the athlete's own wording counts
  as an alias) before finishing, through the statistics script — never
  by editing the file, since the script is what refuses a name another
  exercise already answers to:
  ```
  node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" exercise add --stdin <<'COACH_JSON'
  {"name": "<name>", "aliases": ["<the athlete's wording>"], "equipment": ["…"], "muscles": ["<primary>", "…"], "main": false}
  COACH_JSON
  ```
- **Every exercise is possible with the equipment on record** — the
  athlete's own `gym.md` if they have one, the shared one otherwise. If
  something the agent programmed isn't actually available, substitute it
  yourself (matching movement pattern, respecting anything the athlete
  said in §3 they refuse to do) rather than re-invoking the agent — this
  kind of on-the-spot substitution is the main session's job, not a
  specialist's.

Only once both checks pass is the onboarding complete.

## 9. Finish

List the files created (`.coach.json` if this was a full setup, `exercises.md`
if new, `athletes/<id>/profile.md`, `athletes/<id>/program.md`, and any
`gym.md`) — or, if the specialist call in §6 failed, list what was saved
without `program.md` and say the programme is still pending. Explain the
daily cycle in one or two lines: `/coach:plan` before the gym, `/coach:log`
after. If the athlete mentioned any prior training history (a paper log,
an old spreadsheet), offer `/coach:import`.

**Offer a history of the folder — once, on a full setup only.** Run
`git rev-parse --is-inside-work-tree` in the data folder. If it succeeds,
the folder already has a history: say nothing. If `git` isn't installed,
say nothing either. Otherwise ask one question: turn the folder into a
git repository, so every change the coach makes to a log or the programme
can be seen and undone, with nothing sent anywhere. On yes, run `git init`,
then `git add -A` and `git commit -m "coach: initial setup"`. If the commit
fails because git has no name or email configured, say which one-time
`git config --global` commands would fix it and leave the files staged —
never make up an identity for the athlete. Never add a remote and never
push: where a folder of health data goes is the athlete's decision, and
the README's advice is a *private* repository.

## Rules that apply throughout

- **Never overwrite an existing athlete's files without explicit
  confirmation.** This applies to `profile.md`, `program.md`, and any
  `gym.md` — ask, name the file, and wait for a yes before replacing it.
  `log/` and `reviews/` are never replaced by this skill under any
  circumstance.
- **Dates always come from `stats.mjs today`**, never from memory or estimation.
- **Every program exercise must exist in `exercises.md`** by the time this
  skill finishes; add missing ones with aliases as part of §8.
- **Every program exercise must be possible with the athlete's recorded
  equipment** by the time this skill finishes, per §8.
- Plugin-side text (this file, file templates' structural text) is
  English; everything said to the athlete, and every file written for
  them, is in their language.
