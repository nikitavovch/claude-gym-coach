# Contributing

Thanks for wanting to make the coach better. This file is short on
ceremony and long on the few rules that keep the plugin trustworthy —
please read those before opening a pull request.

## Ways to help

- **Report a bug** — something the coach computed wrong, a command that
  failed, a log it could not read. Use the bug form; it asks for exactly
  what we need to reproduce it.
- **Report bad coaching** — a programme, a progression or a piece of
  advice that looks wrong. Use the coaching-quality form and, if you can,
  point at a source. The agents' claims carry source markers; the aim is
  that every one of them can be checked.
- **Add exercises or aliases** — the most common gap is a name the coach
  does not recognise. See [Exercises](#exercises) below.
- **Translate** — the plugin talks to athletes in their own language, and
  ships English and Russian templates. A new language is a new
  `templates/<lang>/` folder plus aliases in `knowledge/exercises.md`.
- **Port it** — to another agent CLI (see the roadmap in the README).
  Open an issue first so the work can be shared.

Questions and ideas go to [Discussions](https://github.com/nikitavovch/claude-gym-coach/discussions);
security problems go through [SECURITY.md](SECURITY.md), never a public
issue.

## Never paste personal data

Logs, profiles and photos hold health information: injuries, bodyweight,
medication. When you attach a log to an issue or add a test fixture,
replace names and anything identifying. The fixtures in `tests/fixtures/`
are synthetic, and the athletes in every example are the invented Danila
and Vera — keep it that way.

## Setting up

No dependencies, no build step, no `package.json`. Node 20 or newer.

```
git clone https://github.com/nikitavovch/claude-gym-coach
cd claude-gym-coach
node --test                                  # the whole suite, ~3 s
node scripts/stats.mjs help                  # the CLI the skills drive
node scripts/stats.mjs brief --dir tests/fixtures/gym
```

To try your change inside Claude Code, install the plugin from your clone
and run it in a throwaway data folder:

```
claude plugin marketplace add "$(pwd)"       # from inside your clone
claude plugin install coach@claude-gym-coach
mkdir /tmp/coach-try && cd /tmp/coach-try && claude
```

## The rules that matter

These are the project's load-bearing conventions. A pull request that
breaks one of them will be asked to change, however good the rest is.

1. **Numbers in code, judgement in prompts.** Every figure an athlete
   sees — e1RM, trends, stalls, records, fatigue signals, bodyweight
   rates, the gap between cardio and lifting — is computed in
   `scripts/lib/` and printed by `scripts/stats.mjs`. A skill or an agent
   never derives a number itself. If a prompt needs a new number, add it
   to the CLI with a test first.
2. **Tests first.** Every change to `scripts/`, `hooks/` or a skill's
   rules starts with a failing test. The suite is fast; run it often.
3. **Dates come from `stats.mjs today`.** Never write a date from memory
   into a skill, a test or a fixture, and never shell out to `date`.
4. **The hook can never break a session.** `hooks/session-start.mjs`
   exits 0 whatever happens, stays silent outside a coach folder, and
   prints at most one warning per failure.
5. **Prose and code must agree.** `tests/skill-examples.test.mjs` runs the
   worked examples in the skills through the real parser. If you change a
   format, change the examples; if you change an example, it must parse.
6. **Safety boundaries are deliberate.** The pain traffic light, the
   refusal to diagnose, and pharmacology discussed without dosing live in
   `hooks/persona.md`, `knowledge/safety.md` and `agents/nutrition.md`.
   Changing any of them is a decision to argue in the pull request, not
   a wording cleanup.
7. **Evidence carries its source.** Coaching claims in `agents/` and
   `knowledge/` are marked as sourced, expert default or contested. A new
   claim needs a marker, and a source when it has one.

## Exercises

`knowledge/exercises.md` is the single source. The per-language tables in
`templates/*/exercises.md` are generated from it — never edit them by hand:

```
node scripts/dev/build-exercise-tables.mjs
node --test
```

A test fails if two exercises claim the same name, because the lookup is
first-come and the second one would silently lose it.

## Behaviour tests

Unit tests cannot tell whether the model follows a skill. The maintainers
keep a suite of behaviour evals — a live model driven through the dosing
boundary under pressure, a dictation for the wrong athlete, a first setup,
a stale profile, the load in a plan — and run it before every release and
on any pull request that changes a skill, an agent or the persona. You
don't need to run it; say in the pull request what behaviour your change
should alter, and a maintainer will.

## Pull requests

- Keep one change per pull request, with a test that fails without it.
- `node --test` is green on your machine; CI runs it on Linux, macOS and
  Windows against Node 20 and 24.
- Add a line to `CHANGELOG.md` under `## [Unreleased]`.
- Plugin-side text (skills, agents, code comments) is English; anything
  the coach says to an athlete is in the athlete's language.
- Commit messages: a short imperative summary line, then the why.

By contributing you agree that your contribution is licensed under the
project's [MIT licence](LICENSE), and to follow the
[code of conduct](CODE_OF_CONDUCT.md).
