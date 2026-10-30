// The eight workouts from "The Training Guide" (Eight Workouts. One Stronger Athlete.).
// These are only the starting point: once added to your account every field is editable in the app.
//
// Exercise kinds decide what you log for each set:
//   weight  → weight (lb) and reps
//   reps    → reps only (jumps, bodyweight core work)
//   time    → a duration, in `unit` ('sec' or 'min')
// `sets` is how many set rows a session starts with (the top of the guide's range; unused rows
// are simply not saved). `reps` and `rest` are the guide's targets, kept as written.

const ex = (name, sets, reps, rest, notes, kind = 'weight', extra = {}) => ({ name, sets, reps, rest, notes, kind, ...extra });

export const GUIDE_ROUTINES = [
  {
    slug: 'biceps-triceps',
    name: 'Biceps & Triceps',
    tagline: '40–45 min · No supersets',
    intro: 'Warm up elbows and shoulders with light curls and pushdowns. Perform each exercise separately, completing all sets before moving on.',
    note: 'Progress curls and extensions gradually. If elbows or shoulders become irritated, reduce load or sets before adding more exercises.',
    exercises: [
      ex('Incline dumbbell curl', 3, '8–12', '75–90 sec', 'Keep upper arms slightly behind your torso; lower under control without swinging.'),
      ex('Standing dumbbell curl', 3, '8–12', '60–75 sec', 'Keep elbows close to your sides. Use a load that allows a full, controlled range.'),
      ex('Overhead cable or DB triceps extension', 3, '10–15', '75–90 sec', 'Keep ribs down and elbows mostly pointed forward; use a pain-free shoulder position.'),
      ex('Cable triceps pushdown', 3, '10–15', '60–75 sec', 'Keep upper arms still and finish with full elbow extension without leaning bodyweight into it.'),
      ex('Hammer curl (optional)', 2, '10–12', '60 sec', 'Add only if time and elbow recovery allow.'),
      ex('Abs finisher (optional)', 3, '—', '30–45 sec', 'Choose a movement from the abs session; skip if already training core separately. 2–3 sets.', 'reps'),
    ],
  },
  {
    slug: 'heavy-legs',
    name: 'Heavy Legs',
    tagline: '55–70 min · Strength emphasis',
    intro: 'Prioritize crisp technique and controlled reps. This is the main lower-body strength day supporting your jump goal.',
    note: 'If your low back is tired, swap barbell RDLs for lighter dumbbell RDLs or a supported hamstring exercise. If no safe squat setup is available, use a goblet squat or leg press.',
    exercises: [
      ex('Squat variation (barbell, goblet, or leg press)', 4, '4–6', '2–3 min', 'Brace before each rep; use a depth you can control without back or hip discomfort.'),
      ex('Romanian deadlift (DB or barbell)', 3, '6–8', '2 min', 'Soft knees, hips travel back, weights stay close. Stop the descent before your back rounds.'),
      ex('Bulgarian split squat', 3, '8 each leg', '90–120 sec', 'Slight forward torso lean is fine; keep the front foot planted and knee tracking with toes.'),
      ex('Step-up', 2, '8 each leg', '90 sec', 'Use a stable box around knee height or lower; drive through the working leg, avoid pushing off the floor leg.'),
      ex('Standing calf raise', 3, '10–15', '60–90 sec', 'Pause at the top and use a controlled stretch at the bottom.'),
    ],
  },
  {
    slug: 'plyometrics',
    name: 'Plyometrics',
    tagline: '30–45 min · Quality over fatigue',
    intro: 'Do this session when reasonably fresh. Use a firm, non-slippery surface and full recovery between demanding efforts. Start with low contacts and build gradually.',
    note: 'Begin with roughly 20–30 quality jump contacts total, not counting warm-up hops. Reduce volume if landing mechanics deteriorate, joints hurt, or soreness affects the next session. Avoid depth jumps until basic landing strength and tolerance are established.',
    exercises: [
      ex('Pogo jumps', 2, '10–15', '60 sec', 'Small, quick ankle bounces; stay tall and quiet on landing.', 'reps'),
      ex('Countermovement jump', 4, '3', '90–120 sec', 'Jump as high as possible; reset fully between reps. Record best height if you can.', 'reps'),
      ex('Approach jumps (one-foot takeoff)', 4, '2 each side', '90–120 sec', 'Practice your natural approach and left-foot takeoff; stop before jump height declines. Or 4 × 2 on your preferred side.', 'reps'),
      ex('Broad jump', 3, '3', '90 sec', 'Land softly with hips back and knees tracking over feet; hold the landing.', 'reps'),
      ex('Low box jump', 3, '3', '90 sec', 'Choose a box you can land on without tucking knees excessively. Step down—do not jump down. 2–3 sets.', 'reps'),
    ],
  },
  {
    slug: 'chest-back',
    name: 'Chest & Back',
    tagline: '50–65 min · Balanced upper body',
    intro: 'A combined upper-body day. Use controlled reps and avoid arching or twisting to force a lift.',
    note: 'If the low back is fatigued, choose chest-supported rows and avoid unsupported bent-over rows.',
    exercises: [
      ex('Dumbbell or barbell bench press', 3, '6–10', '2 min', 'Keep shoulder blades stable and feet planted; use a spotter or safeties for heavy barbell sets.'),
      ex('Chest-supported row', 3, '8–12', '90 sec', 'Pull elbows toward hips; pause briefly without shrugging.'),
      ex('Incline dumbbell press', 3, '8–12', '90 sec', 'Use a modest incline and a comfortable shoulder range.'),
      ex('Lat pulldown or assisted pull-up', 3, '8–12', '90 sec', 'Drive elbows down; avoid leaning far back or pulling behind the neck.'),
      ex('Cable fly or push-up', 2, '10–15', '60 sec', 'Use a controlled stretch; stop before the front of the shoulder feels pinched.'),
      ex('Seated cable row', 2, '10–12', '60–90 sec', 'Stay tall and avoid rocking the torso to move the weight.'),
    ],
  },
  {
    slug: 'pull',
    name: 'Pull Day',
    tagline: '45–60 min · Back, rear delts, biceps',
    intro: 'Bias supported pulling movements to build your back without unnecessary lower-back loading.',
    note: 'If pull-ups irritate shoulders, use a neutral-grip pulldown. If single-arm rows make you twist or brace awkwardly, use a supported machine row.',
    exercises: [
      ex('Pull-up or lat pulldown', 3, '6–10', '2 min', 'Use assistance or a pulldown load that allows full, controlled reps.'),
      ex('Chest-supported dumbbell row', 3, '8–12', '90 sec', 'Keep chest supported; pull smoothly and avoid shrugging.'),
      ex('Single-arm cable row', 2, '10–12 each', '60–90 sec', 'Keep torso still and avoid rotating to finish the rep.'),
      ex('Reverse pec deck or rear-delt raise', 3, '12–15', '60 sec', 'Move through the shoulder; use light weight and no momentum.'),
      ex('Incline dumbbell curl', 3, '8–12', '75 sec', 'Keep upper arms back and lower slowly.'),
      ex('Hammer curl', 2, '10–12', '60 sec', 'Keep wrists neutral and avoid swinging.'),
    ],
  },
  {
    slug: 'push',
    name: 'Push Day',
    tagline: '45–60 min · Chest, shoulders, triceps',
    intro: 'Use a shoulder-friendly range and keep pressing volume recoverable alongside the chest & back day.',
    note: 'If shoulders are fatigued from chest & back, reduce pressing sets rather than forcing the same volume.',
    exercises: [
      ex('Dumbbell bench press', 3, '6–10', '2 min', 'Use a controlled descent and neutral or semi-neutral grip if shoulders prefer it.'),
      ex('Seated dumbbell shoulder press', 3, '8–10', '90–120 sec', 'Keep ribs down; reduce range or substitute landmine press if overhead motion is uncomfortable.'),
      ex('Incline push-up or incline DB press', 3, '10–12', '90 sec', 'Choose one based on equipment and recovery. 2–3 sets.'),
      ex('Dumbbell lateral raise', 3, '12–20', '60 sec', 'Raise slightly forward of your sides; stop around shoulder height.'),
      ex('Cable triceps pushdown', 3, '10–15', '60–75 sec', 'Keep elbows by your sides and avoid body swing.'),
      ex('Overhead triceps extension', 2, '10–12', '60–75 sec', 'Use a pain-free range; swap for another pushdown variation if overhead position bothers shoulders.'),
    ],
  },
  {
    slug: 'abs',
    name: 'Abs',
    tagline: '15–25 min · Core strength and control',
    intro: 'Complete 2–3 rounds. Rest 30–45 seconds between exercises and 60–90 seconds between rounds. Keep the spine controlled rather than chasing high rep counts.',
    note: 'Progress by adding a few seconds, reps, or a little cable resistance while maintaining control. Skip any movement that reproduces back pain or tingling.',
    exercises: [
      ex('Dead bug', 3, '8–10 each side', '30 sec', 'Keep low back gently controlled against the floor; move slowly.', 'reps'),
      ex('Side plank', 3, '20–40 sec each side', '30 sec', 'Keep hips stacked and body in a straight line; shorten the hold if form slips.', 'time', { unit: 'sec' }),
      ex('Reverse crunch', 3, '10–15', '30 sec', 'Curl pelvis up gently; avoid swinging legs.', 'reps'),
      ex('Pallof press', 3, '10–12 each side', '30 sec', 'Resist rotation; keep hips and shoulders facing forward.'),
      ex('Bird dog', 3, '8–10 each side', '30 sec', 'Reach long without arching or rotating your lower back.', 'reps'),
    ],
  },
  {
    slug: 'cardio',
    name: 'Cardio',
    tagline: '20–35 min · Build aerobic capacity',
    intro: 'Pick one option. Keep most cardio easy enough that you can speak in short sentences. This supports recovery and general conditioning without competing heavily with jump training.',
    note: 'Start with 2 easy sessions per week if conditioning is a priority. Keep hard intervals away from heavy legs and plyometrics; easy cardio can be used on recovery days.',
    exercises: [
      ex('Option A: Incline treadmill walk', 1, '20–30 min', 'Continuous', 'Moderate incline and brisk pace; reduce incline if calves or Achilles feel overloaded.', 'time', { unit: 'min' }),
      ex('Option B: Stationary bike', 1, '20–30 min', 'Continuous', 'Smooth cadence with low-to-moderate resistance; useful when impact needs to be limited.', 'time', { unit: 'min' }),
      ex('Option C: Outdoor brisk walk', 1, '25–35 min', 'Continuous', 'Comfortable pace on a route with manageable hills.', 'time', { unit: 'min' }),
      ex('Intervals (once weekly max)', 6, '1 min brisk / 2 min easy', 'As listed', 'Use bike or another low-impact mode. Keep hard efforts controlled, not all-out.', 'time', { unit: 'min' }),
    ],
  },
];
