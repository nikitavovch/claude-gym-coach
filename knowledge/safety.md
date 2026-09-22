# Safety rules

Single source of safety rules for every specialist agent. Condensed from
the project's research notes on fatigue, deloads and guardrails (pain protocol, method
gating, rate-of-progression) and the project's research notes on masters athletes and returning after a break
(red flags for older athletes). Every threshold below keeps the confidence
marker the source report gave it: `[sourced: ...]` for a cited primary
source, `[practitioner consensus]` for widespread applied-coaching agreement
not derived from a controlled trial, and `[expert default, unverified]` for
this project's own synthesis. Do not upgrade a marker when using this file —
an unverified default stays unverified.

## 1. Pain traffic light

- **Green** — pain ≤3–4/10 during and after the session, settles back to
  baseline by the next morning, not increasing week over week → continue,
  may progress. `[sourced: Silbernagel et al. 2007 pain-monitoring model;
  the exact green ceiling is disputed — some clinical protocols tolerate up
  to ~5/10. This project defaults to the more conservative 3–4/10 because
  the coach cannot see movement quality.]`
- **Amber** — 4–5/10, tolerable during the set, manageable afterward →
  repeat the same session/load, do not progress; if it improves, resume
  normal progression; if it worsens or doesn't improve, apply the Red rule.
  `[sourced, same model]`
- **Red** — pain >5–6/10, OR does not settle by the next day, OR rises
  session-over-session for the same movement → reduce load/volume for that
  specific movement only (not the whole program), and flag it to the user
  explicitly. `[sourced, same model]`
- **Where two bands meet** — a pain of exactly 4/10, or 5–6/10 — the
  higher band applies: §2's most conservative reading. `[expert default,
  unverified — the bands as sourced overlap at their edges]`
- **Two-mentions rule** — pain mentioned in the notes for the same
  movement/body region in ≥2 of the last 3 sessions touching that movement
  → surface an explicit flag, regardless of whether a numeric score was
  given. `[expert default, unverified — built for this project's free-text
  logs; the source literature assumes a structured 0–10 score, not
  free-text mentions]`

## 2. What the coach must never do

- Never name or imply a diagnosis (e.g. "this is tendinopathy").
- Never prescribe a treatment, stretch, or rehab protocol for reported pain.
- Never tell the user to push through red-zone or non-settling pain.
- Never keep programming a movement with unresolved, worsening pain without
  an explicit flag and a recommendation to see a professional.
- Always default to the most conservative reading when the log is
  ambiguous (e.g. pain mentioned with no number attached).

`[sourced: report 03 §6]`

## 3. Method gating table

All gates below are `[practitioner consensus, unverified in RCTs]` — no
controlled trial establishes a training-age cutoff for any of these.

| Method | Minimum gate |
|---|---|
| Smolov base cycle | A proficient squatter with sound, dialed-in technique and real recovery capacity — no source gives a numeric years-trained or bodyweight-multiple figure. Sources disagree on which training-age tier qualifies: PowerliftingTechnique.com restricts it to advanced–elite lifters and lists beginners/intermediates under who should *not* attempt it; Kyle Hunt Fitness sets a lower bar, "intermediate and advanced." Default to the more conservative (advanced-only) reading when uncertain. `[practitioner consensus, disputed — no numeric gate found in any cited source; corrected 2026-09-22, see the project's research notes on fatigue, deloads and guardrails]` |
| Sheiko #29 (beginner/youth variant) | Usable earliest — LiftVault's program page independently confirms #29 as the beginner tier. `[practitioner consensus; corrected 2026-09-22 — the PowerliftingToWin article this row traced to is about an unrelated six-week routine, a program mismatch, not the #29–32 track]` |
| Sheiko #30 | Intermediate tier. LiftVault, the primary program-hosting source, gates #29/#30/#32 by IPF lifter-classification (Class III→beginner, Class II–I→intermediate, CMS+→advanced), explicitly calling this "rough guidelines," not by years trained. One other source (Cast Iron Lift, a footwear-brand content blog) separately states "1–2 years of consistent training" for #30 — kept as a single-source figure, not corroborated elsewhere. `[practitioner consensus for the tier itself; the "~1–2 years" number is single-source, practitioner-tier, unconfirmed — corrected 2026-09-22]` |
| Sheiko #32 (advanced) | Known, accurate 1RMs; advanced-classification lifter per the same classification gate above. Long, high-volume sessions (documented elsewhere as 90–120 minutes, 40–60+ weekly sets) are a general Sheiko-system trait, not confirmed as #32-specific in any source checked — treat "90+ minutes" as descriptive of the system at intermediate-and-up, not a hard #32 gate. `[practitioner consensus; session-length figure not source-confirmed as #32-specific — corrected 2026-09-22]` |
| Bulgarian / daily-max method | **never auto-recommend, at any training age** — elite users of this method had already spent years in conventional programming with technique judged live; bar-speed/technique judgment cannot come from logs alone |
| High-frequency splits for novices (e.g. 6-day PPL) | novices (<~6–12 months) default to 3–4 days/week; higher frequency needs ≥8–12 weeks of stable attendance and no unresolved stall/pain/fatigue flags first `[expert default, unverified as a specific numeric gate]` |
| General composite gate (this project's synthesis) | before surfacing *any* high-fatigue-cost method: (a) the training-age minimum above, (b) no active stall/pain/fatigue flag in the trailing 4–6 weeks, (c) explicit user opt-in — never as an unprompted default suggestion `[expert default, unverified]` |

## 4. Rate-of-progression limits

- Universal max jump per session, only when all sets hit the top of the rep
  range at ~1–2 RIR: **+1–2.5 kg upper body, +2.5–5 kg lower body**
  (pound gyms: **+2.5–5 lb upper, +5–10 lb lower**).
  `[practitioner consensus]`
- Novice, per session: squat/deadlift +5–10 lb; bench/OHP +2.5–5 lb.
  `[practitioner consensus]`
- Intermediate, per month (major lifts): ~5–10 kg (≈10–20 lb) per month,
  slowing further with training age. `[aggregate practitioner observation, not a controlled
  trial]`
- Intermediate deadlift specifically: progress is often "lumpy" — 5–15 kg
  (≈10–33 lb)
  over a 12-week block, concentrated in 2–3 jump weeks rather than smooth
  weekly gains. `[sourced: DeCourcy, M., Omnio Blog, "Your Bench Doesn't
  Progress Like Your Squat: Per-Movement Load Progression," June 18 2026,
  https://getomn.io/blog/posts/personal-load-progression-rates/ — verbatim
  numeric match, confirmed 2026-09-22; still practitioner-tier, as the blog
  cites no primary research of its own]`
- Weekly volume increase for hypertrophy: **+1–2 sets/muscle/week** from
  MEV toward MRV. `[RP applied heuristic, not itself a meta-analysis; the
  underlying direction — more sets, more growth, diminishing returns — IS
  meta-analytically supported: +0.24% hypertrophy per additional set at the
  average 12.25 sets/week, Pelland et al. 2024/2025]`
- **Do not** port ACWR-style ratio thresholds (0.8–1.3 "sweet spot," ≥1.5
  "danger zone") into this coach. `[the framework is methodologically
  discredited: Impellizzeri et al. 2019–2021 showed the "sweet spot" came
  from artificial bucketing of continuous data and the ratio has intrinsic
  numerator/denominator coupling problems]`

## 5. Red flags — refer an older athlete to a doctor

Any one of these, if the athlete volunteers it, is a "see a physician"
moment, not a training-tweak moment:

- Five-times sit-to-stand time **> 15 seconds**
- Usual gait speed **< 1.0 m/s**
- SPPB score **≤ 8**
- A 400-meter walk that can't be completed, or takes **> 6 minutes**
- Unexplained weight loss **≥ 5% over 6 months** in someone not trying to
  lose weight
- A history of recent falls
- New difficulty with stairs, carrying groceries, or rising from a chair

`[sourced: Barbell Medicine 2026, citing Cruz-Jentoft et al. 2019 (EWGSOP2) and Bhasin et al. 2020 (SDOC)]`

Also never diagnose sarcopenia, dynapenia, or frailty; never assess fall
risk as a clinical determination; never advise around a named chronic
disease (advanced CKD, heart failure, COPD, cancer, rheumatologic disease on
chronic steroids, recent prolonged hospitalization) — these require
physician-directed care. `[report 12 §5]`

**Rhabdomyolysis caution on return from a break:** never program an
all-out, high-volume, high-eccentric first return session. Warning signs —
dark/tea-colored urine, muscle swelling/weakness disproportionate to
ordinary soreness, or pain out of proportion to the session — are an
immediate stop-and-seek-care signal, not a training question. `[clinical-
safety consensus, report 12 §7.4]`

**Return after injury:** the coach may apply return-to-training logic to a
previously injured movement pattern only after the athlete states, in their
own words, that they are cleared to train it. Before that statement exists,
redirect to a qualified professional. `[report 12 §8]`

## 6. Overrides — what an explicit request can and cannot unlock

Two classes of guardrail. **Class A** — anything phrased as a default,
preference or routing choice. An athlete's explicit request overrides it
when all four hold: (a) the input attributes the request to the athlete
as something they asked for, in their own words or the caller's summary
of them, and it names the thing the guardrail routes away from rather
than a goal that thing would serve — a stated preference, a dislike, a
training goal, or an inference the agent drew itself is not a request,
and where the input leaves it unclear whether the athlete asked at all,
the agent does not override and names the missing confirmation in its
report; (b) every symptom described sits in §1's Green band as
described, with no Red marker in the athlete's own words; (c) the agent
implements the most conservative form of the request that still
satisfies it; (d) the agent records the warning it would have given, the
override, and that the decision was the athlete's, in both the
programme's Changelog and its report. **Class B** — the method-gating
table in §3, everything in §2's "never do" list, the Red band in §1, and
§8's screening gate, §9's stop-now signs and §10's special cases.
Not overridable by request, insistence or repetition; the athlete gets
what the coach can do instead plus one line on why not.

**Classify on the described facts, not the athlete's own severity
label.** "It's nothing", "it's fine", "it always does that" do not move a
report into Green. Any of the following in the athlete's own description
puts it in Red whatever adjective is attached: sharp or sudden pain, pain
that does not settle by the next morning, pain that grows session over
session on the same movement, pain at night or at rest, numbness,
tingling, or a limb giving way. When a description is ambiguous and
carries no Red marker, §2's conservative-reading rule governs the
implementation — tighter RPE caps, lower starting loads, narrower
progression — and not whether the request is honoured at all.

**What may be summarised, and what may not.** A request survives
paraphrase: either the athlete asked for the thing or they did not, and a
caller's summary carries that as faithfully as a quotation. A description
of pain, injury, or limitation does not survive paraphrase, because the
classification above reads the athlete's own words for Red markers, and a
summary that has already chosen the adjective has already made the
classification. Callers pass such descriptions in the athlete's own words
and store them that way in `profile.md`. An agent handed a pre-classified
description ("mild shoulder pain", "nothing serious") treats the
classification as absent rather than as Green, and says so in its report.

## 7. Routed against your own gate

**Routed against your own gate.** Proceed when the only gate you fail is
a training-age or training-history threshold, the programme you would
actually write clears every minimum in §3, and it demands no capability
the athlete has not already shown. Log the conflict in the Changelog and
name it in your report. Refuse, and name the specialist they should go to
instead, when the method you would have to use depends on something they
do not have: an accurate known 1RM, barbell competence under load, or any
§3 minimum. Training age is a default; a missing prerequisite is a gate.

## 8. Before a first programme — the health screen

`init` asks, once, the seven general-health questions of the PAR-Q+, in
the athlete's language and as plain yes/no questions:

1. Has a doctor ever said you have a heart condition or high blood
   pressure?
2. Do you feel pain in your chest at rest, during daily activities, or
   when you are physically active?
3. Do you lose balance because of dizziness, or have you lost
   consciousness in the last 12 months?
4. Have you been diagnosed with another chronic medical condition?
5. Are you currently taking prescribed medication for a chronic medical
   condition?
6. Do you have, or have you had in the past 12 months, a bone, joint or
   soft-tissue problem that becoming more active could make worse?
7. Has a doctor ever said you should only do medically supervised
   physical activity?

`[sourced: PAR-Q+ 2023, the PAR-Q+ Collaboration (Warburton, Jamnik,
Bredin, Gledhill) — the general health questions, paraphrased]`

- **All no** → proceed.
- **A yes to 2, 3 or 7** → no programme until the athlete states, in their
  own words, that a doctor has cleared them to train. Record the answer
  verbatim in `profile.md` and say plainly why the coach is waiting.
  `[expert default, unverified — the PAR-Q+ routes any yes to follow-up
  questions or a qualified professional; these three are the ones a
  remote coach must not train through]`
- **Any other yes** → record it verbatim, recommend checking with a doctor
  before training hard, and programme conservatively until the athlete
  says they are cleared: no max attempts, RPE capped at 8, the lower end
  of every starting load. `[expert default, unverified]`

## 9. Stop now — signs that end a session

Whatever the programme says, any of these during or soon after training
ends the session and means seeking medical care now. It is never a
training question, and the coach never explains it away:

- chest pain, pressure or tightness; shortness of breath out of
  proportion to the effort; a racing or irregular heartbeat with
  dizziness;
- fainting or nearly fainting, sudden dizziness or confusion;
- a sudden, severe headache during or right after a heavy lift;
- new numbness or weakness in a limb or the face, or sudden trouble
  speaking or seeing;
- back pain together with numbness in the groin or "saddle" area, or new
  trouble controlling the bladder or bowel;
- the rhabdomyolysis signs in §5.

`[sourced: ACSM's Guidelines for Exercise Testing and Prescription —
general indications for stopping exercise; cauda equina red flags per
NICE Clinical Knowledge Summaries (sciatica, low back pain) —
paraphrased]`

## 10. Under 18, pregnancy and the months after birth

- **Under 18.** This coach is built for adults. It does not write a
  programme for someone under 18; it says so, and suggests a qualified
  coach working with them in person, with a parent or guardian involved.
  `[expert default, unverified]`
- **Pregnancy, and the first six months after birth.** A programme only
  after the athlete states that their doctor or midwife has cleared them
  to train, and then only within the limits that clinician set; no max
  attempts. Any of these ends the session and means calling the
  clinician: vaginal bleeding, fluid leaking, regular painful
  contractions, chest pain, dizziness or fainting, a headache, shortness
  of breath before exertion, calf pain or swelling, or muscle weakness
  affecting balance. `[sourced: ACOG Committee Opinion 804, 2020 —
  warning signs to stop exercise during pregnancy; paraphrased. The
  six-month window is this project's conservative default.]`
