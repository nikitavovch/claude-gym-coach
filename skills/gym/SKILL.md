---
name: coach-gym
description: This skill should be used when the athlete's equipment changes — "we got new dumbbells", "купил микроблины", "в зале убрали жим ногами", "I moved to a new gym", "перешёл в другой зал", "update my gym", "обнови инвентарь", or runs /coach:gym. It edits the gym inventory the coach plans against, without re-running init, and says which programmed exercises the change affects.
argument-hint: "[athlete] <what changed>"
---

# Coach Gym

Keeps the gym inventory current. Every plan the coach writes is rounded to
the plates in that file and built from the equipment in it, and the
SessionStart hook prints it into every session — so an inventory that
still lists a leg press the gym sold, or misses the microplates the
athlete just bought, makes every later plan quietly wrong. This skill
edits it in place, then checks each affected programme against the new
equipment and says what changed for it.

It writes only the inventory (`gym.md` or `athletes/<id>/gym.md`) and, when
an athlete switches between the shared gym and one of their own, that
athlete's `gym` field in `.coach.json`. It never touches `program.md`:
what to do about an exercise the gym can no longer support is `plan`'s or
`review`'s call, with the athlete (§6).

This document is written in English, for the model. Everything the coach
says to the athlete during a run is in the athlete's own language.

Plugin files — the statistics script, anything under `knowledge/` or
`agents/`, the templates — are addressed by their full path, which Claude
Code fills in before this text is read. The athlete's own files
(`.coach.json`, `gym.md`, `athletes/<id>/...`) are relative to the working
directory, which during a run is the athlete's data folder.

## 1. Guard

Check for `.coach.json` in the working directory. Missing — tell the
athlete to run `/coach:init` and stop. Present — check its `schema` field:
anything other than `1` means the plugin and the data folder are out of
sync, so say so and stop without attempting to auto-migrate.

## 2. Whose gym is it?

Resolve the athlete from the argument or the conversation, the way the
other skills do; with one athlete in the folder, it is them. Their `gym`
field in `.coach.json` decides the file:

- `own` → `athletes/<id>/gym.md`.
- `shared`, or no field → the root `gym.md`, which every `shared` athlete
  in the folder trains against. Name them before changing anything: "this
  is the gym Danila and Vera share — the change is for both of you."

If the athlete says they now train somewhere else entirely — moved gyms,
or one of two athletes sharing a gym left it — that is a switch, not an
edit: go to §4.

## 3. Edit the inventory

Read the file and take the change from the athlete's words: what arrived,
what left, what's different ("гантели теперь до 40 с шагом 2", "убрали
жим ногами", "купил блины по 0.5"). Apply it to the section it belongs to
— the sections are those of `${CLAUDE_PLUGIN_ROOT}/templates/<lang>/gym.md` —
and leave every other line exactly as written. If a change could mean two
things ("new bar" — a second bar, or a replacement?), ask. When it touches
the bar, the plates or the dumbbells, update the matching machine-readable
line too (`- bar:`, `- plates:`, `- dumbbells: … step …`, or `гриф`,
`блины`, `гантели … шаг`) — `stats.mjs load` rounds every future plan
from it, so a plate bought and not written there is a plate never used.

Show the edited section back in plain words and wait for a yes before
writing the file. Then go to §5.

## 4. Switch gyms

- **An athlete on the shared gym moves to their own:** write
  `athletes/<id>/gym.md` from the template, asking what `init` §5 asks —
  bar weights, the smallest plate jump, the dumbbell range and step, and
  the machines that matter for their training — and set their `gym` to
  `own` in `.coach.json`, changing nothing else in it. The shared file
  stays as it is for whoever still uses it.
- **An athlete with their own gym moves to the shared one:** set `gym` to
  `shared` in `.coach.json`. Leave `athletes/<id>/gym.md` on disk and say
  it is no longer read — deleting a file is the athlete's decision.
- **The whole folder moved** (every athlete on the shared gym): replace
  the shared `gym.md` the same way as a new own gym, asking the same
  questions.

Confirm before writing, as in §3.

## 5. Check the programmes against the new equipment

For each athlete this gym serves who has an `athletes/<id>/program.md`:

1. Turn the new inventory into equipment tags — the vocabulary of
   `${CLAUDE_PLUGIN_ROOT}/knowledge/exercises.md` §3 (`barbell`, `rack`,
   `bench`, `dumbbell`, `cable`, `machine:<name>`, …), exactly as the
   planner does — and run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" catalog --lang <athlete's language> --equipment <tags, comma-separated> --json
   ```
2. Every exercise in the tables under `program.md`'s `## Sessions` that
   the catalogue no longer lists is one the new gym can't support. A name
   the catalogue never knew is a custom exercise from the folder's
   `exercises.md` — check its `Equipment` column there instead.
3. If the smallest plate jump changed, say so: the planner rounds every
   load to it, so progression steps change with it — finer after
   microplates, coarser without them.

## 6. Reply

Say what the inventory now holds, in a line or two, and then, per
athlete, what it means for their programme — or that nothing is affected.
For an exercise that dropped out:

- an accessory: `/coach:plan` substitutes it on the next session and
  records the change in the programme's changelog;
- a main lift: changing the main lifts is a structural change, so point
  to `/coach:review`, which proposes a substitute for the athlete to
  confirm.

Never substitute anything in `program.md` from this skill.

## Rules that apply throughout

- **Only the inventory and the athlete's `gym` field are written**, and
  only after the athlete confirms the change shown to them.
- **Every other line of the inventory stays as the athlete wrote it.**
- **A shared gym is changed for everyone on it** — say who before
  writing.
- Plugin-side text (this file) is English; everything said to the
  athlete, and every file written for them, is in their language.
