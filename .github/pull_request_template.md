## What and why

<!-- One change per pull request. What does it fix or add, and why? Link the issue. -->

## How it was tested

<!-- The test that fails without this change, and anything you ran by hand. -->

## Checklist

- [ ] `node --test` is green.
- [ ] A test was written first, for any change to `scripts/`, `hooks/` or a skill's rules.
- [ ] Every number the athlete sees still comes from `scripts/stats.mjs`, not from a prompt.
- [ ] Worked examples in the skills still parse (`tests/skill-examples.test.mjs`).
- [ ] `CHANGELOG.md` has an entry under `## [Unreleased]`.
- [ ] If a skill, an agent or `hooks/persona.md` changed: I say what behaviour should change, so a maintainer can run the behaviour evals.
- [ ] If a safety boundary changed: the pull request explains why, deliberately.
- [ ] No real personal or health data in fixtures, examples or screenshots.
