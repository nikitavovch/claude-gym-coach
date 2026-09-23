# Changelog

Notable changes to claude-gym-coach. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [semantic versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Both READMEs open on a demo GIF in their own language: setting up with
  the coach, importing an old notebook, a session planned from it with the
  plates for each side, and a workout reported from a phone and logged.

## [1.0.0] — 2026-09-23

The first public release. Before it, two audits and six independent
reviewers went through everything below.

### Coaching

- `/coach:init` — a first setup as a conversation: about ten questions,
  a health screen (PAR-Q+), two or three methodologies with their
  trade-offs, the gym's equipment, and a programme designed by one of four
  specialists (beginner, strength, hypertrophy, powerbuilding) inside the
  gym's real equipment. A second athlete can share the folder.
- `/coach:plan` — the next session from the programme's rotation and
  rules and the athlete's own history. Every barbell and dumbbell load is
  rounded by `stats.mjs load` to the gym's plates, with the plates for each
  side, and each main lift gets a warm-up ramp from `stats.mjs warmup`.
- `/coach:log` — free dictation in any wording, in English or Russian, into
  the log format: sets, RPE, misses and where they stopped, cardio, a
  morning bodyweight, a day with only cardio. It asks rather than guesses,
  except where today's plan already names the exercise meant, and then
  says what it wrote; it never holds a session back for the duration or
  how it felt. It shows the lines it wrote, questions a load far off the
  last session, and announces a record only when there was one to beat.
- `/coach:review` — a period read against the programme by an analyst:
  records, trends against six to eight weeks earlier, stalls, volume,
  attendance, misses, cardio interference, fatigue signals listed as what
  fired, bodyweight against the phase. It asks whether a stale profile
  still holds, and applies no change until the athlete confirms each one.
- `/coach:phase` — cut, bulk or maintain, with the measured bodyweight
  rate judged against a signed target.
- `/coach:import` — a paper notebook, pasted or photographed, into one log
  file per day; photos are transcribed for the athlete to correct first.
- `/coach:exercise` and `/coach:gym` — teach the coach an exercise or a
  name for one, and keep the gym's equipment current, each through a
  guarded writer.
- Technique and nutrition specialists, reached from any conversation. The
  nutrition one answers in numbers — a starting calorie estimate corrected
  by the bodyweight trend, protein, the surplus or deficit for the phase,
  timing, hydration, recovery, supplements graded by evidence with their
  working doses — and explains steroids, SARMs, growth hormone,
  clenbuterol and TRT with their known risks.

### Numbers

- Every figure about the athlete's history is computed by
  `scripts/stats.mjs`, plain Node with no dependencies: e1RM, smoothed
  trends and a six-to-eight-week anchor, records by e1RM, by load and for
  each rep count from 1 to 12 (weighted pull-ups and dips by added load),
  stalls, fatigue signals, weekly volume and tonnage, attendance, cardio
  load and its gap to lifting, bodyweight trends and verdicts.
- `stats.mjs export` — the logs as CSV or JSON for a spreadsheet.
- More than 400 tests on Linux, macOS and Windows, Node 20 and 24.

### Safety

- A pain traffic light, never a diagnosis; signs that end a session and
  mean seeking care; no programme before a doctor's clearance where the
  screen calls for one, none for anyone under 18, and none in pregnancy or
  the months after birth without a clinician's clearance.
- Drugs are explained, never dosed: no protocol, dose, cycle or source,
  however the question is put. Food and supplements get their numbers.
- The athlete's words never reach a shell as command-line text, and the
  plugin sends nothing anywhere.

### Project

- Behaviour evals, run before every release, drive a live model through
  what unit tests cannot reach: the dosing boundary under pressure, a
  dictation for the wrong athlete, a first setup, a dictated bodyweight, a
  stale profile, and a plan's load.
- Contribution guide, code of conduct, security policy, issue forms,
  Dependabot and CodeQL.
