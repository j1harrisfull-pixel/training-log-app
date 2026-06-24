# Training Log — Built-in Offline Coach (design spec)

Date: 2026-06-23
Status: approved-for-spec-review

## 1. Goal
Type a plain sentence in the app and get a week of workouts, instantly. No JSON, no schema, no paste, no internet, no signup. The plan is read-only; you just train against it. Replaces the copy-paste-Claude flow as the default way to build a week (Claude paste path stays available, tucked away).

Example input: `3 workouts this week, build muscle and mobility, 30-45 min`.

## 2. Hard constraints
- 100% offline, no API, no account. Pure client-side logic in the existing single `index.html`.
- The user never sees or edits code/JSON. Output renders in the existing tracker.
- Outputs the existing internal format (`training-log/program@1`) so weeks, supersets, rest timer, current-exercise highlight, and progress all keep working unchanged.
- New logic (parser, library helpers, generator) is pure and unit-tested (Node, test-first), embedded verbatim into the inline script.

## 3. Components

### 3a. Intake parser  `parseIntake(text) -> {days, goal, includes[], minutes, focus[], assumptions[]}`
Keyword/regex parse of a plain sentence:
- **days**: "3 workouts" / "3 sessions" / "3 days" / "x3" -> 3. Default 4.
- **goal**: muscle/hypertrophy/build -> "hypertrophy"; strength/stronger -> "strength"; fat loss/lean/conditioning/cardio -> "conditioning"; general/fitness -> "general". Default "general" (but with "build muscle" present -> hypertrophy).
- **includes**: "mobility" -> mobility; "cardio"/"conditioning" -> conditioning. (Adds a piece per session.)
- **minutes**: "30-45 min" / "45 minutes" / "under 40" -> a cap (use the upper bound). Default 60.
- **focus**: "upper"/"lower"/"push"/"pull"/"legs"/"arms"/"chest"... -> bias body part. Optional.
- **assumptions[]**: human-readable list of anything defaulted (e.g. "Assumed: full gym, intermediate, 60 min"), shown to the user so it is never a black box.
Robust to phrasing/case/extra words; always returns a usable object.

### 3b. Exercise library  (EXTENSIVE + elite — the core deliverable)
A curated array. Each entry:
`{ id, name, type: strength|mobility|conditioning, equipment, pattern, muscles:[...], compound:bool, goals:[hypertrophy,strength,general,conditioning,mobility], unit:"reps"|"sec", cue }`
- **cue** = elite technique note, always in the form `Setup: ... Key: ... Fault: ...`.
- **Coverage requirement (extensive, all types):** every movement pattern across equipment, plus mobility and conditioning:
  - Squat (back/front/goblet/hack/leg press/split squat/leg extension)
  - Hinge (deadlift/trap-bar/RDL/hip thrust/back extension/leg curl/KB swing/good morning)
  - Horizontal push (bench/incline/DB variants/machine press/push-up/cable fly/pec deck)
  - Vertical push (OHP/DB & machine shoulder press/lateral raise/Arnold)
  - Horizontal pull (barbell/DB/chest-supported/seated cable/machine row/face pull)
  - Vertical pull (pull-up/chin-up/lat pulldown/straight-arm pulldown)
  - Biceps, triceps (curls incl. hammer/preacher/incline; pushdown/skull crusher/overhead ext/dips/close-grip)
  - Calves, core (plank/hanging leg raise/cable crunch/ab wheel/Pallof/dead bug), carries (farmer)
  - Mobility (90/90 hip, couch stretch, ankle rock, t-spine opener/rotation, cat-cow, hip-flexor, thoracic ext, band pull-apart, shoulder dislocates, world's greatest, deep squat hold, wrist prep)
  - Conditioning (bike/row intervals, incline walk, sled push, KB complex)
  - Target breadth: ~70-100 movements at launch; structured so more can be appended without touching the engine.
- A small `libraryIntegrity()` self-check (every entry has required fields + a well-formed cue) is unit-tested so the library can't silently rot.

### 3c. Generator  `generateProgram(intake, history) -> program`
- **Split by days**: 1->full body; 2->upper/lower; 3->full-body A/B/C (hypertrophy default) or push/pull/legs; 4->upper/lower x2; 5->PPL+upper+lower; 6->PPL x2. Sessions named by their split role.
- **Exercises per session** from the time cap: `clamp(round(minutes/8), 3, 8)`, reserving one slot for a mobility piece when `includes` has mobility.
- **Selection**: fill each session's target patterns/muscles for the split role, honoring goal and (default full) equipment, biased by `focus`. Prefer one compound anchor per session, then accessories. Use **supersets** (shared `group` letter) on accessories when the time cap is tight, to fit.
- **Prescription by goal**: hypertrophy = compounds 3-4x6-10 @RPE7-8 rest 2-3min, accessories 3x10-15 @RPE8 rest 60-90s; strength = main 4-5x3-5 @RPE7-8 rest 3min; general = 3x8-12 @RPE7 rest 90s; mobility = 2 x (8-10 reps or 30-45s); conditioning = intervals/time.
- **Weights (no faking strength):** for each chosen movement, look up the most recent logged weight for that **exercise name** across `state.log` + `state.archive`; use it if found, else leave `weight: 0` (blank) for the user to set on the first set. Everything else (sets/reps/RPE/rest/cue) is filled.
- Output a normalized `training-log/program@1` (1 week, N sessions) via the existing `normalizeProgram`. Variety: vary selection by an incrementing seed passed in (so re-building gives a fresh week).

## 4. UI
- Plan sheet reworked: top = **"Build my week"** with a text box ("Tell me what you want, e.g. 3 workouts, build muscle + mobility, 30-45 min") and a **Build** button.
- On Build: parse -> generate -> show a one-line **assumptions** readout + preview (title, N days) -> it becomes the active program (old one archived via existing `pruneArchive`/`compactLog`, never lost). Read-only; to change, type again and Build.
- The copy-paste-Claude section moves below a collapsed "Advanced: import from Claude" disclosure (kept, not removed).

## 5. Out of scope (for now)
- Automatic week-to-week progression (manual re-build for now; revisit after use).
- Goals beyond hypertrophy/general/mobility being deeply tuned (strength + conditioning supported but lighter); the **library** is extensive across all types regardless.
- Editing the generated plan by hand (read-only by design).

## 6. Acceptance criteria
- Typing a plain sentence builds a sensible week with no code shown; assumptions surfaced.
- Parser handles count/goal/mobility/time/focus + messy phrasing; always returns a usable result.
- Library is extensive (all patterns + mobility + conditioning, ~70+ moves), every entry has an elite `Setup/Key/Fault` cue; `libraryIntegrity()` passes.
- Generator respects day count, time cap (exercise count + supersets), goal prescriptions, mobility inclusion; pulls last-logged weight by name or leaves blank.
- Output loads through the existing tracker; rest timer, supersets, highlight, progress all work.
- Single self-contained `index.html`; inline JS + sw.js pass `node --check`; manifest valid; new pure logic covered by Node tests (parser, generator shape, weight-from-history, library integrity); verified in preview (light + dark).
