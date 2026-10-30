// One small line icon per muscle group, drawn to match the app's other icons.
const PATHS = {
  chest: (
    <>
      <path d="M11.3 7.4C9.2 5.9 6 5.9 4 7.6v4.6c1.7 2.2 5.2 2.4 7.3.9V7.4Z" />
      <path d="M12.7 7.4c2.1-1.5 5.3-1.5 7.3.2v4.6c-1.7 2.2-5.2 2.4-7.3.9V7.4Z" />
      <path d="M8 17.5h8" />
    </>
  ),
  back: (
    <>
      <path d="M4.5 5h15l-3.5 14.5H8L4.5 5Z" />
      <path d="M12 6.5v11.5M8 8.5l3 4.5M16 8.5l-3 4.5" />
    </>
  ),
  shoulders: (
    <>
      <circle cx="12" cy="5.5" r="2.2" />
      <path d="M3.5 15.5c0-3.6 2.3-6.3 5.3-6.3h6.4c3 0 5.3 2.7 5.3 6.3" />
      <path d="M3.5 15.5v4M20.5 15.5v4M8.5 12.5v7M15.5 12.5v7" />
    </>
  ),
  biceps: (
    <>
      <path d="M4.5 19.5c.4-3.4 1.5-6 3.2-8.2L6 7.5l2-2.5 3.3 3.2c1-.8 2.2-1.2 3.5-1.2 3 0 5 2.3 5 5.3 0 3.4-2.4 5.6-5.6 4.8-2.6-.7-5.6-.2-8.2 2.4" />
      <path d="M12 12.2c.8-.9 2-1.3 3.2-1" />
    </>
  ),
  triceps: (
    <>
      <path d="M7 3.5v7.5c0 2.4 1.3 4 3.6 4.8l1.4 4.7" />
      <path d="M11 3.5v7c0 1.5.6 2.6 1.7 3.4l2.8 6.1" />
      <path d="M7 5.5C4.8 6.5 4.4 10.5 6.4 12" />
    </>
  ),
  forearms: (
    <>
      <path d="M3 7.5h18" />
      <path d="M8.5 7.5v5a3.5 3.5 0 0 0 7 0v-5" />
      <path d="M10 15.6l-.7 5M14 15.6l.7 5" />
    </>
  ),
  quads: (
    <>
      <path d="M8.5 3c-.9 4-.9 8.2.4 11.5L8 21h4l.8-6.5c1.6-3.4 1.7-7.6.7-11.5" />
      <path d="M10 6.5c.6 2.4.6 4.6 0 6.5" />
      <circle cx="10.6" cy="15.2" r="1" />
    </>
  ),
  hamstrings: (
    <>
      <path d="M7 3.5c-.4 3.6.2 7 2 9.8l5.5 2.7 3.5 4.5" />
      <path d="M11 3.5c.3 3.2 0 6.2-.9 8.6" />
      <path d="M8.6 7.5c.7.8 1.5 1.4 2.4 1.7" />
    </>
  ),
  glutes: (
    <>
      <path d="M4.5 8.5h15" />
      <path d="M4.5 8.5c0 5 2 9 7.5 9s7.5-4 7.5-9" />
      <path d="M12 8.5v9" />
      <path d="M6.5 15c1.8.6 3.5.2 5.5-1.5 2 1.7 3.7 2.1 5.5 1.5" />
    </>
  ),
  calves: (
    <>
      <path d="M10 3c-2.2 3.2-2.4 7.6-.4 11.2V18L7 20.5h6.5v-6.3c2.2-3.6 2-8-.5-11.2" />
      <path d="M10.4 6.5c-.8 1.8-.9 3.8-.2 5.6" />
    </>
  ),
  core: (
    <>
      <rect x="7" y="3.5" width="10" height="17" rx="3.5" />
      <path d="M12 3.5v17M7 9h10M7 14.5h10" />
    </>
  ),
};

export default function MuscleIcon({ group, size = 22 }) {
  const p = PATHS[group];
  if (!p) return null;
  return (
    <svg className={`mus-icon m-${group}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {p}
    </svg>
  );
}
