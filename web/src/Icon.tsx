const PATHS = {
  link: [
    "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1",
    "M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  ],
  spin: ["M12 4a8 8 0 1 0 8 8"],
  check: ["M5 12.5l4.5 4.5L19 7.5"],
  refresh: [
    "M20 11a8 8 0 0 0-14.3-4.9L4 8",
    "M4 4v4h4",
    "M4 13a8 8 0 0 0 14.3 4.9L20 16",
    "M20 20v-4h-4",
  ],
  warn: ["M12 4l9 16H3z", "M12 10v4", "M12 17.5v0.01"],
  external: ["M14 5h5v5", "M19 5l-8 8", "M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4"],
  tray: ["M4 13l2.5-7h11l2.5 7", "M4 13v5h16v-5h-5a3 3 0 0 1-6 0z"],
  menu: ["M4 7h16", "M4 12h16", "M4 17h16"],
  rows: ["M9 6h11", "M9 12h11", "M9 18h11", "M4 6h1", "M4 12h1", "M4 18h1"],
  grid: ["M4 4h6v6H4z", "M14 4h6v6h-6z", "M4 14h6v6H4z", "M14 14h6v6h-6z"],
  close: ["M6 6l12 12", "M18 6L6 18"],
  trash: [
    "M4 7h16",
    "M9 7V4h6v3",
    "M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12",
    "M10 11v6",
    "M14 11v6",
  ],
  comment: ["M5 5h14v10H10l-4 4v-4H5z"],
  left: ["M15 5l-7 7 7 7"],
  right: ["M9 5l7 7-7 7"],
  document: ["M5 4h10l4 4v12H5z", "M9 12h6", "M9 16h4"],
  search: ["M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0z", "M20 20l-3.5-3.5"],
  filters: ["M4 6h16", "M7 12h10", "M10 18h4"],
  chevron: ["M6 9l6 6 6-6"],
  picture: ["M4 5h16v14H4z", "M4 16l4.5-4.5 3.5 3.5 2.5-2.5L20 17", "M15.5 9.5v0.01"],
  eye: ["M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z", "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"],
  "source-reddit": ["M5 4v16", "M5 7h13", "M9 12h11", "M9 17h7"],
  "source-x": ["M4 5h16v11h-9l-4 4v-4H4z"],
  "source-github": ["M8 7l-5 5 5 5", "M16 7l5 5-5 5"],
  "source-article": ["M4 6h16M4 10h16M4 14h16M4 18h10"],
  "source-other": [
    "M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0z",
    "M4 12h16M12 4c3.5 3.5 3.5 12.5 0 16M12 4c-3.5 3.5-3.5 12.5 0 16",
  ],
  "eye-off": [
    "M3 3l18 18",
    "M10.6 6.1A10 10 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.2 3.9",
    "M6.6 6.6A16.6 16.6 0 0 0 2 12s3.5 6 10 6a10 10 0 0 0 4-.9",
  ],
} as const;

export function Icon({
  name,
  className,
  label,
}: Readonly<{ name: keyof typeof PATHS; className: string; label?: string }>) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden={label === undefined ? "true" : undefined}
      role={label === undefined ? undefined : "img"}
      aria-label={label}
    >
      {PATHS[name].map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}
