# Starting loads without a 1RM test

Moved from `program-beginner.md` §4.1. Read this whenever any programme
agent or the `planner` needs a first working weight for an exercise with
no logged history — a brand-new athlete's first session, an exercise
introduced mid-programme, or a substitution swapped in for equipment
reasons. Training age doesn't change this: an advanced lifter starting an
exercise they've never logged needs the same calibration ramp a novice
does, not a guess and not a max attempt.

Never run a max test. Ramp to a calibration set instead:

```
Step 0 — bar competency gate (skip if the athlete reports prior lifting experience)
  offer empty-bar or technique-bar start: 20 kg (men's), 15 kg (women's), 10 kg (technique)
    pound gyms: 45 lb (men's), 35 lb (women's), 15-25 lb (training bar)
  2x5 at that bar; if it felt trivial and controlled -> proceed same session
  else: stay at empty/technique bar for session 1-2, defer loading

Step 1 — population prior, a soft UPPER bound, never a target
  standards_beginner_kg = bodyweight_kg * sex_lift_multiplier[lift]   # StrengthLevel/ExRx table below
  first_session_ceiling = standards_beginner_kg * 0.4-0.6
  # "Beginner" tier on these tables already assumes ~1 month of training [sourced] —
  # discount hard for a true day-1 novice

Step 2 — ramp to a calibration set, not a max attempt
  empty_bar x5 -> ~50-60% of ceiling x5 -> single 10-15% jumps x3-5
  stop the FIRST time a set at the target rep count (8-10 double-progression, 5 fixed 3x5)
  lands at RPE 6-7. This load = session-1 top set. Never push toward failure.

Step 3 — convert to the program's actual prescription
  fixed 3x5 linear (SS/StrongLifts/BBR/Greyskull/GZCLP T1): working weight = that load,
    optionally minus ~10% so the first prescribed session is very likely to succeed
  double progression / 8-12 rep range: use that load directly, at the BOTTOM of the range

Step 4 — let the log recalibrate once (not a new default)
  session 2 lands well under RPE 7-8 for prescribed reps -> allow ONE larger-than-standard
    jump to correct, then resume normal increments
  session 2 fails the prescribed reps -> drop 10%, resume standard increment logic from there
```

Strength-standards table (StrengthLevel/ExRx, self-selected sample of people who
already track lifts — use as an upper bound, never a target) `[sourced, self-selection caveat]`:
"Beginner" = 5th percentile after ≥1 month of practiced technique. A true day-1 novice sits
well below this. Female multipliers, ×bodyweight: squat 0.50, bench 0.30, deadlift 0.75.
Male: squat 0.75, bench 0.50, deadlift 1.00. Heavier untrained lifters routinely outperform a
flat %BW estimate on squat/deadlift simply from moving more mass — the RPE-anchored ramp in
Step 2 corrects for this regardless of which direction the prior errs
`[practitioner heuristic, not a cited study]`.
