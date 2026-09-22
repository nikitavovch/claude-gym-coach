# Security policy

## Reporting a vulnerability

Please report security problems privately, through GitHub's
[private vulnerability reporting](https://github.com/nikitavovch/claude-gym-coach/security/advisories/new)
— not in a public issue. You will get an acknowledgement within a week,
and a fix or a plan for one as soon as the problem is understood.

## What counts

The plugin runs code on your machine and keeps health information, so
these are security issues, not ordinary bugs:

- anything that lets text from a log, a pasted notebook, a photo or an
  exercise name run a command on the athlete's machine;
- anything that sends the data folder, or part of it, anywhere the
  athlete did not ask it to go;
- the SessionStart hook failing in a way that breaks or hijacks a
  session;
- **a way around the coach's safety boundaries** — getting it to name
  doses of a drug or anabolic, to diagnose an injury, or to tell someone
  to train through pain it is built to stop. These live in
  `hooks/persona.md`, `knowledge/safety.md` and `agents/nutrition.md`,
  and a reliable bypass is treated with the same urgency as a code
  vulnerability.

When you report, include the plugin version (`.claude-plugin/plugin.json`),
your Claude Code version (`claude --version`) and the smallest steps that
reproduce it. Never include real personal health data — invent it.

## Supported versions

Only the latest release receives fixes.
