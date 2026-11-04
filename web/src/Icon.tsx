const PATHS = {
  link: [
    "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1",
    "M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  ],
  warn: ["M12 4l9 16H3z", "M12 10v4", "M12 17.5v0.01"],
  external: ["M14 5h5v5", "M19 5l-8 8", "M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4"],
  tray: ["M4 13l2.5-7h11l2.5 7", "M4 13v5h16v-5h-5a3 3 0 0 1-6 0z"],
} as const;

export function Icon({
  name,
  className,
}: Readonly<{ name: keyof typeof PATHS; className: string }>) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      {PATHS[name].map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}
