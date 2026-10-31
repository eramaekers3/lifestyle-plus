import { norm } from './text.js';
// The built-in exercise library: 4–6 options per muscle group, each with what it specifically targets.
// Picking one copies it into a workout, where every field stays editable.
//   focus:   the part of the muscle it hits hardest
//   muscles: sets credited per muscle group (1 = main mover, 0.5 = helper), used for "Sets this week"

export const GROUPS = [
  { id: 'chest', label: 'Chest', blurb: 'Upper, mid and lower chest' },
  { id: 'back', label: 'Back', blurb: 'Lats for width, rows for thickness, traps' },
  { id: 'shoulders', label: 'Shoulders', blurb: 'Front, side and rear delts' },
  { id: 'biceps', label: 'Biceps', blurb: 'Long head, short head, brachialis' },
  { id: 'triceps', label: 'Triceps', blurb: 'Long, lateral and medial heads' },
  { id: 'forearms', label: 'Forearms', blurb: 'Grip, flexors and extensors' },
  { id: 'quads', label: 'Quads', blurb: 'Front of the thigh' },
  { id: 'hamstrings', label: 'Hamstrings', blurb: 'Back of the thigh' },
  { id: 'glutes', label: 'Glutes', blurb: 'Glute max and the side of the hip' },
  { id: 'calves', label: 'Calves', blurb: 'Upper calf, lower calf, shin' },
  { id: 'core', label: 'Core', blurb: 'Abs, obliques, deep core' },
];

const x = (group, name, focus, muscles, sets, reps, rest, notes, kind = 'weight', unit) => ({
  group, name, focus, muscles, sets, reps, rest, notes, kind, ...(unit ? { unit } : {}),
});

export const LIBRARY = [
  // Chest
  x('chest', 'Barbell bench press', 'Mid chest · overall size and strength', { Chest: 1, Triceps: 0.5, Shoulders: 0.5 }, 4, '5–8', '2–3 min', 'Shoulder blades pinched, feet planted, bar to the lower chest.'),
  x('chest', 'Incline dumbbell press', 'Upper chest (clavicular head)', { Chest: 1, Shoulders: 0.5, Triceps: 0.5 }, 3, '8–12', '90 sec', 'Bench at 30°. Lower until you feel a stretch across the upper chest.'),
  x('chest', 'Low-to-high cable fly', 'Upper chest, isolated', { Chest: 1 }, 3, '12–15', '60 sec', 'Cables low, sweep up and in to chin height with a slight elbow bend.'),
  x('chest', 'High-to-low cable fly', 'Lower and inner chest', { Chest: 1 }, 3, '12–15', '60 sec', 'Cables high, bring hands down and together in front of your hips.'),
  x('chest', 'Chest dip', 'Lower chest', { Chest: 1, Triceps: 0.5 }, 3, '8–12', '90 sec', 'Lean forward and let elbows flare slightly to bias the chest.', 'reps'),
  x('chest', 'Push-up', 'Whole chest · bodyweight', { Chest: 1, Triceps: 0.5, Shoulders: 0.5 }, 3, '10–20', '60 sec', 'Body in one straight line; chest to just above the floor.', 'reps'),

  // Back
  x('back', 'Pull-up', 'Lats · width', { Back: 1, Biceps: 0.5 }, 3, '6–10', '2 min', 'Start from a dead hang, drive elbows down to your ribs.', 'reps'),
  x('back', 'Lat pulldown', 'Lats · width', { Back: 1, Biceps: 0.5 }, 3, '8–12', '90 sec', 'Slight lean back, pull the bar to the top of your chest.'),
  x('back', 'Barbell row', 'Mid back · thickness', { Back: 1, Biceps: 0.5 }, 4, '6–10', '2 min', 'Hinge to about 45°, pull the bar to your belly button.'),
  x('back', 'Seated cable row', 'Mid back and rhomboids', { Back: 1, Biceps: 0.5 }, 3, '10–12', '90 sec', 'Chest tall, squeeze shoulder blades together at the end.'),
  x('back', 'Single-arm dumbbell row', 'Lower lats', { Back: 1, Biceps: 0.5 }, 3, '8–12 each', '75 sec', 'Pull the dumbbell toward your hip, not your shoulder.'),
  x('back', 'Dumbbell shrug', 'Upper traps', { Back: 1 }, 3, '10–15', '60 sec', 'Straight up toward your ears, pause, no rolling.'),

  // Shoulders
  x('shoulders', 'Overhead press', 'Front delts · pressing strength', { Shoulders: 1, Triceps: 0.5 }, 4, '5–8', '2 min', 'Squeeze glutes, press straight up and move your head through.'),
  x('shoulders', 'Seated dumbbell shoulder press', 'Front and side delts', { Shoulders: 1, Triceps: 0.5 }, 3, '8–12', '90 sec', 'Elbows slightly in front of your body, not flared straight out.'),
  x('shoulders', 'Dumbbell lateral raise', 'Side delts · width', { Shoulders: 1 }, 3, '12–20', '60 sec', 'Lead with elbows, stop at shoulder height, no swinging.'),
  x('shoulders', 'Cable lateral raise', 'Side delts · tension at the bottom', { Shoulders: 1 }, 3, '12–15 each', '45 sec', 'Cable behind you, raise out to the side.'),
  x('shoulders', 'Rear-delt fly', 'Rear delts', { Shoulders: 1, Back: 0.5 }, 3, '12–20', '60 sec', 'Chest supported or bent over; sweep arms wide, thumbs slightly down.'),
  x('shoulders', 'Face pull', 'Rear delts and rotator cuff', { Shoulders: 1, Back: 0.5 }, 3, '12–15', '60 sec', 'Rope to your forehead, pull the ends apart, finish with hands by ears.'),

  // Biceps
  x('biceps', 'Barbell curl', 'Both heads · overall size', { Biceps: 1, Forearms: 0.5 }, 3, '8–12', '75 sec', 'Elbows pinned at your sides, no hip swing.'),
  x('biceps', 'Incline dumbbell curl', 'Long head (outer bicep, stretched)', { Biceps: 1 }, 3, '8–12', '75 sec', 'Arms hang behind your torso on a 45–60° bench.'),
  x('biceps', 'Preacher curl', 'Short head (inner bicep)', { Biceps: 1 }, 3, '8–12', '75 sec', 'Armpits snug to the pad; control the bottom.'),
  x('biceps', 'Hammer curl', 'Brachialis and brachioradialis · arm thickness', { Biceps: 1, Forearms: 0.5 }, 3, '10–12', '60 sec', 'Neutral grip, thumbs up the whole way.'),
  x('biceps', 'Cable curl', 'Constant tension · peak contraction', { Biceps: 1 }, 3, '12–15', '60 sec', 'Step back slightly so there’s tension at the bottom.'),
  x('biceps', 'Concentration curl', 'Short head · peak', { Biceps: 1 }, 2, '10–12 each', '45 sec', 'Elbow braced on your inner thigh, squeeze hard at the top.'),

  // Triceps
  x('triceps', 'Close-grip bench press', 'All three heads · heavy', { Triceps: 1, Chest: 0.5 }, 3, '6–10', '2 min', 'Hands shoulder-width, elbows tucked close to your sides.'),
  x('triceps', 'Overhead cable extension', 'Long head (stretched)', { Triceps: 1 }, 3, '10–15', '75 sec', 'Face away from the cable, elbows pointing forward, full stretch.'),
  x('triceps', 'Rope pushdown', 'Lateral head (outer tricep)', { Triceps: 1 }, 3, '10–15', '60 sec', 'Upper arms still, spread the rope apart at the bottom.'),
  x('triceps', 'Skull crusher', 'Long and medial heads', { Triceps: 1 }, 3, '8–12', '75 sec', 'Lower the bar to just behind your head; elbows stay narrow.'),
  x('triceps', 'Bench dip', 'All heads · bodyweight', { Triceps: 1, Chest: 0.5 }, 3, '10–15', '60 sec', 'Hands behind you on a bench, upright torso, lower to 90°.', 'reps'),

  // Forearms
  x('forearms', 'Wrist curl', 'Forearm flexors (inner forearm)', { Forearms: 1 }, 3, '12–20', '45 sec', 'Forearms on your thighs, palms up, curl only at the wrist.'),
  x('forearms', 'Reverse wrist curl', 'Forearm extensors (outer forearm)', { Forearms: 1 }, 3, '12–20', '45 sec', 'Palms down, light weight, slow.'),
  x('forearms', 'Reverse curl', 'Brachioradialis (top of the forearm)', { Forearms: 1, Biceps: 0.5 }, 3, '10–15', '60 sec', 'Overhand grip on an EZ bar, elbows at your sides.'),
  x('forearms', 'Farmer’s carry', 'Grip and upper traps', { Forearms: 1, Back: 0.5 }, 3, '40', '90 sec', 'Heavy dumbbells, walk tall with short quick steps.', 'time', 'sec'),
  x('forearms', 'Dead hang', 'Grip endurance', { Forearms: 1 }, 3, '30–60', '60 sec', 'Hang from a bar with straight arms and active shoulders.', 'time', 'sec'),

  // Quads
  x('quads', 'Back squat', 'Quads and glutes · heavy strength', { Quads: 1, Glutes: 0.5 }, 4, '5–8', '2–3 min', 'Brace before each rep, sit between your heels, knees track your toes.'),
  x('quads', 'Front squat', 'Quads, upright torso', { Quads: 1, Glutes: 0.5 }, 3, '6–8', '2 min', 'Elbows high, stay upright, sit straight down.'),
  x('quads', 'Leg press', 'Quads · no back loading', { Quads: 1, Glutes: 0.5 }, 3, '10–15', '90 sec', 'Feet mid-platform, lower until hips start to curl.'),
  x('quads', 'Hack squat', 'Outer quads (vastus lateralis)', { Quads: 1, Glutes: 0.5 }, 3, '8–12', '2 min', 'Feet lower and narrower on the platform for more quad.'),
  x('quads', 'Leg extension', 'Front of the quad (rectus femoris), isolated', { Quads: 1 }, 3, '12–15', '60 sec', 'Pause and squeeze at the top; lower slowly.'),
  x('quads', 'Bulgarian split squat', 'Quads and glutes, one leg at a time', { Quads: 1, Glutes: 1 }, 3, '8–10 each', '90 sec', 'Back foot on a bench; front knee travels forward over the toes.'),

  // Hamstrings
  x('hamstrings', 'Romanian deadlift', 'Hamstrings · stretched hip hinge', { Hamstrings: 1, Glutes: 0.5 }, 3, '6–10', '2 min', 'Soft knees, push hips back, bar slides down your thighs.'),
  x('hamstrings', 'Lying leg curl', 'Hamstrings · knee bend (lower hamstring)', { Hamstrings: 1 }, 3, '10–12', '75 sec', 'Hips down on the pad, curl all the way, lower slowly.'),
  x('hamstrings', 'Seated leg curl', 'Hamstrings · lengthened position', { Hamstrings: 1 }, 3, '10–12', '75 sec', 'Lean your torso forward slightly for a bigger stretch.'),
  x('hamstrings', 'Nordic curl', 'Hamstrings · eccentric strength, injury-proofing', { Hamstrings: 1 }, 3, '4–8', '2 min', 'Anchor your heels, lower as slowly as you can, push back up.', 'reps'),
  x('hamstrings', 'Good morning', 'Hamstrings and lower back', { Hamstrings: 1, Glutes: 0.5 }, 3, '8–10', '90 sec', 'Light bar on your back, hinge with a flat back.'),

  // Glutes
  x('glutes', 'Hip thrust', 'Glute max · top-end squeeze', { Glutes: 1, Hamstrings: 0.5 }, 4, '8–12', '90 sec', 'Upper back on a bench, chin tucked, lock out with your glutes.'),
  x('glutes', 'Glute bridge', 'Glute max · bodyweight or light', { Glutes: 1, Hamstrings: 0.5 }, 3, '12–20', '60 sec', 'Drive through your heels, pause at the top.', 'reps'),
  x('glutes', 'Cable kickback', 'Glute max, isolated', { Glutes: 1 }, 3, '12–15 each', '45 sec', 'Slight forward lean, kick back and slightly out.'),
  x('glutes', 'Hip abduction machine', 'Glute medius (side of the hip)', { Glutes: 1 }, 3, '15–20', '45 sec', 'Lean forward a little to hit more glute.'),
  x('glutes', 'Walking lunge', 'Glutes and quads', { Glutes: 1, Quads: 1 }, 3, '10 each', '90 sec', 'Long steps for glutes, shorter steps for quads.'),
  x('glutes', 'Step-up', 'Glutes, one leg at a time', { Glutes: 1, Quads: 1 }, 3, '8 each', '90 sec', 'Knee-height box, drive through the top foot only.'),

  // Calves
  x('calves', 'Standing calf raise', 'Gastrocnemius (upper calf)', { Calves: 1 }, 4, '10–15', '60 sec', 'Full stretch at the bottom, pause at the top.'),
  x('calves', 'Seated calf raise', 'Soleus (lower, deeper calf)', { Calves: 1 }, 3, '12–20', '45 sec', 'Bent knees shift the work to the soleus.'),
  x('calves', 'Single-leg calf raise', 'Gastrocnemius · balance and evening out sides', { Calves: 1 }, 3, '10–15 each', '45 sec', 'On a step, hold something for balance.', 'reps'),
  x('calves', 'Leg press calf raise', 'Gastrocnemius · heavy', { Calves: 1 }, 3, '12–15', '60 sec', 'Balls of your feet on the platform edge, knees straight.'),
  x('calves', 'Tibialis raise', 'Shin (tibialis) · balances the calves', { Calves: 1 }, 3, '15–20', '45 sec', 'Back against a wall, heels out, lift your toes.', 'reps'),

  // Core
  x('core', 'Plank', 'Deep core · resisting arching', { Core: 1 }, 3, '30–60', '45 sec', 'Squeeze glutes, ribs down, straight line from head to heels.', 'time', 'sec'),
  x('core', 'Hanging leg raise', 'Lower abs and hip flexors', { Core: 1 }, 3, '8–15', '60 sec', 'Curl your pelvis up at the top, don’t swing.', 'reps'),
  x('core', 'Cable crunch', 'Upper abs (rectus abdominis)', { Core: 1 }, 3, '10–15', '60 sec', 'Kneel, round your spine down toward your knees.'),
  x('core', 'Ab wheel rollout', 'Whole abs, stretched', { Core: 1 }, 3, '6–12', '75 sec', 'Roll out only as far as you can without your back sagging.', 'reps'),
  x('core', 'Side plank', 'Obliques (sides)', { Core: 1 }, 3, '30–45 each', '45 sec', 'Hips stacked and high.', 'time', 'sec'),
  x('core', 'Pallof press', 'Obliques · resisting rotation', { Core: 1 }, 3, '10 each', '45 sec', 'Stand side-on to the cable, press out and hold without twisting.'),
];

const byName = new Map(LIBRARY.map((e) => [norm(e.name), e]));

/** The library entry for an exercise name, if it's one of ours. */
export const libraryEntry = (name) => byName.get(norm(name));

/** A group's id for an exercise name: from the library, or guessed from its muscles. */
export function groupOf(name, musclesFor) {
  const lib = libraryEntry(name);
  if (lib) return lib.group;
  const m = musclesFor ? musclesFor(name) : {};
  const main = Object.entries(m).sort((a, b) => b[1] - a[1])[0];
  return main ? main[0].toLowerCase() : null;
}

/** A copy ready to go into a workout. */
export const toExercise = (e) => ({
  name: e.name,
  sets: e.sets,
  reps: e.reps,
  rest: e.rest,
  notes: e.notes,
  kind: e.kind,
  ...(e.unit ? { unit: e.unit } : {}),
  ...(e.focus ? { focus: e.focus } : {}),
});
