export interface OverviewLine {
  readonly text: string;
  readonly about: readonly string[];
}

export const OVERVIEWS: ReadonlyMap<string, readonly OverviewLine[]> = new Map([
  [
    "Home servers",
    [
      {
        text: "A small mini PC with an external drive shelf can replace a four-bay NAS and idle at about half the power.",
        about: ["mini PC"],
      },
      {
        text: "The Items on this topic agree that backups come first: restore a folder on a schedule and compare checksums.",
        about: ["restore drill", "mini PC"],
      },
      {
        text: "Measure the power draw at the wall for a week before you buy a UPS, because the labels overstate it.",
        about: ["UPS"],
      },
    ],
  ],
  [
    "Databases",
    [
      {
        text: "SQLite in WAL mode needs shared memory, so the database file belongs on a local disk and not on a network share.",
        about: ["WAL"],
      },
      {
        text: "VACUUM INTO makes a compact backup copy of a live database without blocking writers for long.",
        about: ["VACUUM"],
      },
    ],
  ],
  [
    "Typography",
    [
      {
        text: "A narrow reading column needs hyphenation more than a wide one, and the browser needs a language attribute to hyphenate.",
        about: ["Hyphenation"],
      },
      {
        text: "Hanging punctuation straightens the edge of a column, but only Safari supports it today.",
        about: ["Optical"],
      },
    ],
  ],
  [
    "Local-first software",
    [
      {
        text: "Conflicts, not sync, are the hard part of a local-first app, and most of them are one note edited offline on two devices.",
        about: ["learned shipping"],
      },
      {
        text: "Showing both versions side by side beats a clever merge, and a log of changes per device makes replay and catch-up simple.",
        about: ["Show both", "append-only"],
      },
    ],
  ],
  [
    "Keyboards",
    [
      {
        text: "Hall effect switches held up over six months, and an adjustable actuation point is the feature people keep using.",
        about: ["Hall effect"],
      },
      {
        text: "Most stabilizer rattle comes from a wire that is only half seated, and grease belongs on the wire ends.",
        about: ["stabilizer"],
      },
    ],
  ],
]);
