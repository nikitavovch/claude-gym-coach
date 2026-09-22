---
name: coach-exercise
description: This skill should be used when the athlete wants the coach to know an exercise it doesn't recognize, or another name for one it does — "add an exercise", "добавь упражнение", "у меня своё упражнение", "the coach doesn't know X", "я называю это по-другому", "запомни, что X — это Y", or runs /coach:exercise. It adds a row to the data folder's exercises.md, or an alias to an existing row, through the statistics script.
argument-hint: "<exercise name>"
---

# Coach Exercise

Teaches the folder's exercise table something new: a whole exercise the
table doesn't have, or another name for one it does. Everything else in
this plugin resolves exercise names through that table — `log` writes
canonical names by it, `report` groups volume by its muscles, `exercises`
and every record are keyed by it — so a row added carelessly doesn't just
sit there: a new name that some existing exercise already answers to takes
that name over, and every session ever logged under it silently moves to
the new row. That is why this skill never edits `exercises.md` itself. It
gathers the answers and hands them to `stats.mjs exercise add` or
`stats.mjs exercise alias`, which refuse any name already taken, any
muscle or equipment the table doesn't use, and any `|` or `;` inside a
name, and only then write the file.

This document is written in English, for the model. Everything the coach
says to the athlete during a run is in the athlete's own language.

Plugin files — the statistics script, anything under `knowledge/` or
`agents/` — are addressed by their full path, which Claude Code fills in
before this text is read. The athlete's own files (`.coach.json`,
`exercises.md`, `athletes/<id>/...`) are relative to the working directory,
which during a run is the athlete's data folder, not the plugin.

## 1. Guard

Check for `.coach.json` in the working directory. Missing — tell the
athlete to run `/coach:init` and stop. Present — check its `schema` field:
anything other than `1` means the plugin and the data folder are out of
sync, so say so and stop without attempting to auto-migrate.

`exercises.md` is shared by everyone in the folder, so there is no athlete
to resolve — but say so if two athletes share the folder: a row added here
is added for both.

## 2. Is it already known?

Take the name from the argument, or ask for it — exactly as the athlete
says it. Then run:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" exercises --stdin --json <<'COACH_JSON'
{"names": ["<the name exactly as the athlete said it>"]}
COACH_JSON
```

`known: true` means the table already answers to that name: tell the
athlete which exercise it resolves to (`canonical`) and stop. Nothing to
add.

## 3. Another name, or a new exercise?

Most unknown names are a known exercise said differently — "тяга Мидса"
for the table's `Тяга Мидоуза`, "присед Андерсона" for `Присед от пинов`.
Read `exercises.md` and look for rows that plausibly mean the same
movement: same implement, same pattern, a shared word in the name or
aliases. Also check `${CLAUDE_PLUGIN_ROOT}/knowledge/exercises.md` §9 — a
bare "жим", "тяга", "разводка" and the like are ambiguous on purpose, and
the answer to those is the qualifying word, never a new row.

- **One plausible match:** ask a single yes/no question — "это
  `Присед от пинов`?". On yes, go to §4 with that row.
- **Several:** list them and ask which one, with "none of these — a new
  exercise" as the last choice.
- **None**, or the athlete says it's something different: go to §5.

Never decide this silently. Merging two different movements hides the
second one's history inside the first; splitting one movement in two
halves its records.

## 4. Add the name to an existing exercise

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" exercise alias --stdin <<'COACH_JSON'
{"name": "<existing name>", "aliases": ["<new name>", "<another>"]}
COACH_JSON
```

`name` can be the canonical name or any alias it already has. Add every
spelling the athlete actually uses, in one call. The athlete's words go in
the JSON exactly as they said them: the quoted `'COACH_JSON'` delimiter
stops the shell from expanding anything between the lines, so the only
escaping is JSON's own (`\"` for a quote inside a name). Go to §7.

## 5. Add a new exercise

Gather, in one message rather than a question at a time:

- **The name** in the athlete's language, as they'd want to read it in a
  plan — this becomes the canonical name, and it is permanent: logs are
  written with it, so it is never renamed later.
- **Other names** they use for it — the dictated spelling always goes in,
  if it isn't the canonical name itself.
- **Equipment**, using the table's own tags (`barbell`, `dumbbell`,
  `bench`, `cable`, `bodyweight`, … — the full list is in
  `${CLAUDE_PLUGIN_ROOT}/knowledge/exercises.md` §3), or `machine:<name>` for
  a specific machine. Check it against the athlete's gym inventory; an
  exercise their gym can't do is worth a word, but it is theirs to add.
- **Muscles**, primary first — `report` counts weekly sets under the
  first one — from the same §3 vocabulary.
- **Main lift or not.** `yes` only for a heavy multi-joint movement they
  load progressively and want trends and stall checks on (the criterion
  in `knowledge/exercises.md` §4); `validate` then insists on RPE for it.
  When in doubt, `no`.

Show the row back in plain words and wait for a yes. Then:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" exercise add --stdin <<'COACH_JSON'
{"name": "<name>", "aliases": ["<a>", "<b>"], "equipment": ["<e1>", "<e2>"], "muscles": ["<primary>", "<secondary>"], "main": false}
COACH_JSON
```

Same heredoc rule as §4: the athlete's text goes into the JSON as said.

## 6. When the script refuses

Every refusal names what to fix; relay it and ask, never work around it:

- `already names <exercise>` — that name belongs to another exercise.
  Either the athlete meant that exercise after all (go back to §3), or the
  new one needs a different name or a qualifier.
- `unknown muscle` / `unknown equipment` — the message lists the table's
  vocabulary; pick from it with the athlete. A new muscle name would split
  their weekly volume by a spelling.
- `holds "|"` or `holds ";"` — those characters separate the table's
  columns and lists; rephrase without them.
- `which a shell would act on` — a name with `"`, a backtick, `$` or `\`
  in it would run as code on a later command line; rephrase without it.

## 7. Reply

Say what the table now knows, in one or two lines, from the script's
output. Mention that every earlier log that used the new name now counts
toward that exercise — names are resolved when a log is read, not when it
was written, so nothing needs re-logging.

## Rules that apply throughout

- **`exercises.md` is written only through `stats.mjs exercise add` and
  `stats.mjs exercise alias`, with `--stdin`** — never with an editor,
  never by hand, never with the athlete's words on the command line.
- **Nothing is renamed or removed.** A canonical name is what the logs
  hold; a spelling the athlete dislikes gets a new alias, not a rename.
- **Merging or splitting movements is always the athlete's call** (§3).
- Plugin-side text (this file) is English; everything said to the
  athlete, and every name written for them, is in their language.
