# claude-gym-coach

[![tests](https://github.com/nikitavovch/claude-gym-coach/actions/workflows/test.yml/badge.svg)](https://github.com/nikitavovch/claude-gym-coach/actions/workflows/test.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![version](https://img.shields.io/badge/version-1.0.0-informational.svg)](CHANGELOG.md)
[![Claude Code plugin](https://img.shields.io/badge/Claude%20Code-plugin-d97757.svg)](https://code.claude.com/docs/en/plugins)
![English | Русский](https://img.shields.io/badge/lang-EN%20%7C%20RU-lightgrey.svg)

**A personal strength coach for [Claude Code](https://code.claude.com).**
It designs your programme, writes each session from your own history and
your gym's real plates, logs what you dictate after training, reviews
every block, and keeps all of it as plain markdown files in a folder you
own. Drive it from the terminal — or from your phone, walking out of the
gym.

[Русская версия](README.ru.md)

An exchange looks like this:

```
you:   /coach:plan
coach: Danila, Lower A, 2026-09-23 — week 6 of 8.
       Back Squat      3x5 @ 105 kg   (RPE 8; last time 102.5 x 5 @ 8)
       Romanian DL     3x8 @ 82.5 kg  (RPE 7)
       Leg Curl        3x12 @ 40 kg
       Squat moves up 2.5 kg: all three sets landed at RPE 8 last week.

you:   /coach:log squat 105 for 5 three times, RPE 8, 8, 8.5. RDL 82.5 for 8,
       three sets, RPE 7. Leg curls 40 for 12, three sets. Weighed 82.4.
coach: Danila, Lower A, 2026-09-23 — logged:
         Back Squat: 105x5 @8, 105x5 @8, 105x5 @8.5
         Romanian Deadlift: 82.5x8x3 @7
         Lying Leg Curl: 40x12x3
       New 5-rep record on the squat: 105 kg (was 102.5). Bodyweight 82.4.
```

---

- [What it does](#what-it-does)
- [What it will not do](#what-it-will-not-do)
- [Quick start](#quick-start)
- [Commands](#commands)
- [A week with the coach](#a-week-with-the-coach)
- [From your phone: Remote Control](#from-your-phone-remote-control)
- [Your data](#your-data)
- [How it works](#how-it-works)
- [What a command costs](#what-a-command-costs)
- [Honest limits](#honest-limits)
- [Roadmap](#roadmap)
- [Contributing](#contributing)

## What it does

- **Designs your programme with you.** A short interview — goal, training
  age, schedule, injuries, what you like and refuse — then two or three
  methodologies with their trade-offs, and one of four specialist
  designers (beginner, strength, hypertrophy, powerbuilding) writes the
  block. Every exercise it programmes exists in your gym.
- **Writes today's session** from the programme and your recent numbers.
  Every load is rounded by the script to plates you actually own — with
  what goes on each side of the bar — and each main lift gets a warm-up
  ramp built the same way.
- **Logs what you say**, in your own words and your own language:
  `bench 80 for 5 three times, last one RPE 8`, a miss and where it
  stopped, cardio, a morning bodyweight, a day with only a run. It asks
  about what's genuinely ambiguous and never guesses an exercise.
- **Knows your numbers** — estimated 1RM, smoothed trends, records by
  e1RM, by load and for every rep count from 1 to 12, stalls, fatigue
  signals, weekly volume per muscle and tonnage, attendance against your
  target, cardio load and how close it sat to lifting, bodyweight rate
  against your cut or bulk.
- **Reviews each block** against the programme and proposes changes —
  and applies none of them until you confirm each one.
- **Answers technique and nutrition questions** through dedicated
  specialists. Nutrition comes with numbers: a starting calorie estimate
  and how to correct it from your bodyweight trend, protein, the surplus or
  deficit for your phase, meal timing, hydration, recovery, and
  supplements graded by evidence with their working doses — creatine
  3–5 g a day, caffeine 3–6 mg/kg. On drugs — steroids, SARMs, growth
  hormone, clenbuterol, TRT — it explains what each one is, its known
  risks, and why bloodwork and a doctor come first.
- **Imports your history** from a paper notebook — pasted, or as photos of
  the pages, transcribed for you to check first.
- **Coaches more than one person** from one folder: you and a training
  partner, each with their own programme, log and gym.
- **Exports** everything as CSV for a spreadsheet or a chart.

## What it will not do

- **Invent a number.** Every weight, record and trend it states comes from
  your log files through a tested script. No data means "no data".
- **Diagnose you.** Pain gets a traffic light, not a diagnosis: mild pain
  that settles by morning carries on, moderate pain holds the load where
  it is, and sharp, lingering or growing pain cuts load and volume on that
  movement and is flagged to you — as is pain on the same movement in two
  of three sessions, with the advice to see a professional.
- **Train you before it should.** A first setup asks the standard health
  screen (PAR-Q+); chest pain, fainting or a doctor's "supervised only"
  means no programme until a doctor clears you. It doesn't programme
  anyone under 18, or a pregnancy without a clinician's clearance, and a
  chest pain or a sudden severe headache ends a session, full stop.
- **Write a drug protocol.** Steroids, SARMs, growth hormone and the rest
  get a straight answer about what they are and what they risk — never a
  dose, a cycle or where to get them, however the question is put. Food
  and supplements do get numbers, with the reminder that a doctor or a
  dietitian decides where a health condition is involved.
- **Judge a lift it can't see.** It has no video. Form questions get cues
  to check yourself, not a verdict.
- **Change your programme behind your back.** Small adjustments come with
  a reason and a changelog line; structural ones only through
  `/coach:review`, with your yes on the concrete edit.
- **Send your data anywhere.** Everything stays in your folder.

## Quick start

You need [Claude Code](https://code.claude.com) and Node 20 or newer.

```
claude plugin marketplace add nikitavovch/claude-gym-coach
claude plugin install coach@claude-gym-coach
```

Make a folder for your training data — it is separate from the plugin,
and it is yours — and start Claude Code in it:

```
mkdir ~/gym && cd ~/gym && claude
```

Then:

```
/coach:init
```

The setup is a conversation: about ten questions, a choice of
methodology, your gym's equipment. It ends with a profile and a programme
in your folder, and it offers to start a local git history of the folder.
From then on the cycle is two commands: `/coach:plan` before the gym,
`/coach:log` after it.

To update or remove the plugin, use `/plugin` inside Claude Code.

## Commands

| Command | What it does | You might say |
|---|---|---|
| `/coach:init` | First setup, or a new athlete in the same folder | "set me up", "add my partner" |
| `/coach:plan` | Writes the next session from the programme and your history | "what am I doing today" |
| `/coach:log` | Records a session from free dictation, reports deviations and records | "bench 80 for 5, three sets…" |
| `/coach:review` | Analyses a period and proposes programme changes, one confirmation each | "review my last 4 weeks" |
| `/coach:phase` | Cut, bulk or maintain — and whether bodyweight follows the target | "I'm starting a cut" |
| `/coach:import` | Turns a paper notebook — text or photos — into log files | "import my old notebook" |
| `/coach:exercise` | Teaches the coach an exercise or another name for one | "I call it the Meadows row" |
| `/coach:gym` | Updates your equipment and checks the programme against it | "we got dumbbells up to 40" |

You rarely need the slash form: ask in plain words and the matching
command runs. Every command takes an athlete's name when two people share
a folder — `/coach:plan vera`.

## A week with the coach

**Before training** — `/coach:plan` writes the day's file,
`athletes/<you>/log/<date>.md`, with the plan in it. It follows the
programme's rotation, progresses from what you actually did, and rounds
every load to your plates.

**After training** — `/coach:log` and just talk. It turns the dictation
into set lines, asks once about anything it can't resolve (an unknown
exercise, a main lift without an RPE), says where you deviated from the
plan and announces a record only when there was a previous one to beat.
If two athletes share the folder and the dictation matches the other
person's plan better, it says so before writing anything.

**Any day** — ask a technique question and the technique specialist
answers with cues; ask about nutrition or a supplement and the nutrition
specialist answers within its boundaries. Mention pain and the coach
follows its pain rules, not your programme.

**End of a block** — `/coach:review` reads the period against the
programme: records, trends per main lift, stalls, volume, attendance,
misses, cardio interference, fatigue signals listed as what fired (never a
made-up score), bodyweight against your phase. It asks whether your
profile still holds when nobody has confirmed it for eight weeks, then
proposes changes one at a time. A structural change is designed by a
specialist and shown as a concrete diff before it is written.

## From your phone: Remote Control

The setup this plugin was designed around: a laptop at home runs Claude
Code inside your data folder, and you use it from your phone through
[Remote Control](https://code.claude.com/docs/en/remote-control) — plan
on the way to the gym, dictate the log on the way out.

**Setting it up**

1. In the data folder, start a Remote Control session:
   ```
   cd ~/gym && claude remote-control
   ```
   It prints a link and a QR code.
2. Open it in the Claude app on iOS or Android, or at claude.ai/code in a
   browser. The first time, the app asks you to confirm the device.
3. Keep the laptop running the session: leave the terminal open (or use
   `tmux`), and keep it awake while you're out — on a Mac,
   `caffeinate -i claude remote-control` holds off idle sleep for as long
   as the session runs.
4. Turn on push notifications in `/config`, so a question from the coach
   reaches your phone instead of waiting unseen.
5. The first time the coach runs its statistics script, answer the
   permission prompt with "Yes, and don't ask again" for that command —
   every command calls it several times, and approving each call from a
   phone gets old fast.
6. In a session that stays open for days, send `/clear` now and then: the
   coach re-reads everything it needs from your files on every command,
   so nothing is lost, and each command stays fast and cheap.

**What works from the phone** — everything the coach does: every
`/coach:*` command, the specialists, the session-start context, writing
your files, its questions and permission prompts. You can send photos
straight from the phone's camera, which makes `/coach:import` of a
notebook page a two-tap job, and your phone keyboard's voice input turns
logging a session into talking.

**Pros and cons**

| Good | Mind this |
|---|---|
| Nothing to install on the phone beyond the Claude app | The laptop must be on, online and running the session |
| Your files never leave your own machine | While connected, the conversation transcript is kept on Anthropic's servers to sync devices |
| Same coach, same files from terminal, browser and phone | Not available to organisations with Zero Data Retention |
| Photos and questions work as on the desktop | A sleeping laptop reconnects when it wakes; a closed terminal ends the session |
| Several devices can follow one session | Approving each file write on a phone gets tedious; `claude remote-control --permission-mode acceptEdits` trades that for less oversight |

## Your data

Everything lives in one folder you choose — plain markdown, readable and
editable by hand, easy to back up and to version:

```
~/gym/
  .coach.json            # athletes, language, units (kg or lb)
  gym.md                 # the shared gym's equipment
  exercises.md           # the exercise table, with your own additions
  athletes/
    danila/
      profile.md         # goal, history, injuries in your own words
      program.md         # the current block, with a changelog
      phases.md          # cut / bulk / maintain, with target rates
      log/2026-09-23.md  # one file per training day
      reviews/2026-W39.md
    vera/
      …                  # a second athlete, fully separate
      gym.md             # only if she trains somewhere else
```

A training day looks like this:

```markdown
---
date: 2026-09-23
session: Lower A
status: done
time: 18:30
duration_min: 70
feel: 4
bodyweight: 82.4
---

## Plan
- Back Squat: 105x5x3 @8

## Actual
- Back Squat: 105x5 @8, 105x5 @8, 105x5 @8.5
- Romanian Deadlift: 82.5x8x3 @7
- Lying Leg Curl: 40x12x3

## Cardio
- Run 30min Z2, 5km, 08:00

## Notes
Slept six hours.
```

A set is `load x reps [x count] [@rpe]` — `80x5x3 @8` is three sets of five
at 80, in the units you chose at setup, kilos or pounds — with `BW` and
`BW+10` for bodyweight work and `(miss: bottom)` for where a failed set
stopped. The `x` may be Latin, Cyrillic or `*`. A day with only cardio is
a file with no `## Actual`. Edit any file by hand; the next command
validates what it touches, or check one yourself:

```
node "$COACH_PLUGIN_ROOT/scripts/stats.mjs" validate athletes/<id>/log/<date>.md
```

**In a spreadsheet** — `export` writes your logs as CSV (or `--json`), one
row per set, session or cardio line, with the same e1RM the coach uses:

```
node "$COACH_PLUGIN_ROOT/scripts/stats.mjs" export sets --since 3m > sets.csv
```

**Privacy** — the plugin sends nothing anywhere; your files stay in your
folder, and only what Claude Code itself does as part of a session leaves
it. Keeping the folder in a *private* git repository gives you history
and a backup — `/coach:init` offers to start one locally and never adds a
remote.

## How it works

```
 you ──▶ skill (plan · log · review · …) ──▶ stats.mjs ──▶ your markdown files
              │                                 ▲
              └──▶ specialist agents ───────────┘
                   programme designers · planner · analyst · technique · nutrition
```

- **Numbers in code, judgement in prompts.** Every figure about your
  history — e1RM, trends against six to eight weeks ago, stalls, records,
  fatigue signals, bodyweight rate, cardio gaps — is computed by
  `scripts/stats.mjs`, plain Node with no dependencies and more than 400
  tests. The next working weight is the planner's call under your
  programme's rules; the load it writes, and every warm-up step, is then
  rounded to your plates by the same script. That is what makes "never
  invent a number" checkable instead of a wish.
- **Skills are procedures** (`skills/*/SKILL.md`): step by step, with the
  failure cases spelled out — the wrong athlete, a name nobody knows, a
  file that already exists.
- **Specialists are separate agents** (`agents/*.md`) with sourced
  knowledge: four programme designers, a planner, an analyst, a technique
  coach and a nutrition advisor. Their claims carry markers — sourced,
  expert default, contested — each sourced one naming its study or
  position stand.
- **A SessionStart hook** gives every session in your folder the coach's
  persona and safety rules, your roster, your gym and a brief of where
  each athlete stands. Outside a coach folder it stays silent.
- **Behaviour evals**, run by the maintainers before every release, drive
  a live model through what unit tests can't reach — the dosing boundary
  under pressure, a dictation for the wrong athlete, a first setup, a
  stale profile, the load in a plan.

## What a command costs

The plugin does not hide it. Every session in your folder loads the
persona (~600 words), your roster and your gym. Each command then loads,
roughly, in words of prompt:

| Command | Skill | Specialist it may call | Specialist's model |
|---|---|---|---|
| `/coach:plan` | 2 800 | `planner` 2 600 | sonnet |
| `/coach:log` | 3 400 | — | — |
| `/coach:phase` | 2 300 | — | — |
| `/coach:import` | 4 100 | — | — |
| `/coach:exercise` | 1 200 | — | — |
| `/coach:gym` | 1 000 | — | — |
| `/coach:review` | 3 500 | `analyst` 3 000, plus a programme designer up to 4 700 for a structural change | **opus** |
| `/coach:init` | 2 700 | a programme designer up to 4 700 | **opus** |

A skill runs on your session's model; the specialists carry their own.
If your plan or provider has no Opus, set `model: inherit` in
`agents/analyst.md` and the four `agents/program-*.md` of your install.
Designing a block is the part worth paying opus for, so `/coach:log` after
a workout costs what your session costs and `/coach:review` at the end of
a block pays for opus on top. The ~9 900-word exercise database is never
read whole: specialists ask `stats.mjs catalog` for the columns they need,
filtered to your gym — about 3 800 words, closer to 2 200 for a home gym.

## Honest limits

- **No video, no sensors.** It knows what you tell it. Form feedback is
  cues, not correction; there is no wearable or heart-rate integration.
- **It speaks when spoken to.** No reminders of its own — Remote Control
  push notifications cover its questions, not "time to train".
- **Dictation can be misread.** It asks when a name or a number is
  unclear and never resolves an ambiguous exercise silently, but it is
  still a language model reading your words — glance at what it logged.
- **Two languages ship today.** English and Russian templates and
  exercise names; the coach talks in others, but the exercise table is
  bilingual.
- **It costs what Claude Code costs.** There is no free tier of its own;
  see [What a command costs](#what-a-command-costs).
- **It is not a medical service.** It stops at pain it doesn't recognise
  and at the dose of any drug.

## Roadmap

- **Other agent CLIs.** The plugin will be ported beyond Claude Code — to
  OpenAI's Codex CLI, OpenCode, Gemini CLI, Cursor's CLI and others. Most
  of it already travels: `stats.mjs` is plain Node, the skills are
  markdown procedures, the knowledge base is prose with sources. What
  each port has to rebuild is the wiring — the session-start hook, the
  subagents and how commands are registered.
- More languages for templates and exercise names.
- Warm-up ramps and plate loading computed per session.
- Meet peaking and attempt selection for powerlifters.

Ideas and votes are welcome in
[Discussions](https://github.com/nikitavovch/claude-gym-coach/discussions).

## Contributing

Bug reports, coaching-quality reports (with sources, ideally), exercises,
translations and ports are all welcome — start with
[CONTRIBUTING.md](CONTRIBUTING.md), which holds the few rules that keep
the coach trustworthy. Security problems, including any reliable way
around the safety boundaries, go through [SECURITY.md](SECURITY.md).

```
node --test                              # the whole suite, ~3 s, any OS
node scripts/stats.mjs help              # the CLI the skills drive
```

Released under the [MIT licence](LICENSE).
