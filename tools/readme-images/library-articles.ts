import type { SeedHighlight, SeedItem } from "./seed-types.ts";

export const ARTICLE_ITEMS: readonly SeedItem[] = [
  {
    key: "backups",
    accent: "teal",
    url: "https://homelab-notes.example/restore-drill",
    page: {
      title: "A backup you have not restored is a hope",
      author: "Homelab Notes",
      markdown:
        "Every month I restore one random folder from the off-site copy onto a spare disk and compare checksums against the original. It takes twenty minutes, and it is the only part of my backup routine that has ever surprised me.\n\n## What the drill caught\n\nIn eight months it found two things: a job that skipped hidden folders, and a retention rule that had quietly dropped a year of photos. Both jobs reported success every night.\n\n> A backup is finished when a restore has worked once, not when the job reports success.\n\n## How to run one\n\nPick the folder with a dice roll, so the drill does not drift toward the folders you already trust. Restore it to a spare disk, never over the original. Compare checksums, not file counts, because a count hides a file that restored empty. Write down the date and the result in a plain text file, and put the next drill in your calendar before you close the terminal.",
    },
    digest: {
      title: "A monthly restore drill catches what a backup job reports as success",
      topic: "Home servers",
      tags: ["backups", "checksums"],
      summary:
        "Restoring one random folder each month found two silent failures in eight months.\nThe drill takes twenty minutes and needs only a spare disk.",
      keyPoints: [
        "Compare checksums after the restore, not file counts.",
        "A retention rule had dropped a year of photos without an error.",
      ],
    },
  },
  {
    key: "ups",
    accent: "moss",
    url: "https://homelab-notes.example/ups-sizing",
    page: {
      title: "Sizing a UPS for a small rack",
      author: "Homelab Notes",
      markdown:
        "Size a UPS by what the rack draws at the wall, not by the label on each machine. The labels state the worst case the power supply can deliver, and a small home rack almost never gets near it.\n\n## What I measured\n\nI put a plug-in power meter between the wall and the rack and read it once a day for a week. The rack idled at 94 W and peaked at 131 W during the nightly backup. The labels added up to 220 W, so the measured peak was about 40% under the sum of the labels.\n\n## What to buy\n\nA unit rated for roughly twice the measured peak gives you room to add a machine and still holds the rack long enough to shut it down cleanly. A larger unit costs more, runs its fans more, and its battery ages the same either way.\n\nRead the meter again after any change to the rack, because the number you buy against is the number you measured.",
    },
    digest: {
      title: "Sizing a UPS by measured draw instead of the label",
      topic: "Home servers",
      tags: ["power draw", "ups"],
      summary:
        "Measure the draw at the wall for a week before you buy a UPS.\nThe label overstated this rack's draw by 40%.",
      keyPoints: ["A smaller unit covered the measured load with room to spare."],
    },
  },
  {
    key: "vacuum",
    accent: "cobalt",
    url: "https://sqlite-notes.example/vacuum-into",
    read: true,
    page: {
      title: "VACUUM INTO as a backup",
      author: "SQLite Notes",
      markdown:
        "`VACUUM INTO` writes a compact copy of a live SQLite database to a new file, and it is the simplest backup command the engine offers.\n\n```sql\nVACUUM INTO '/backups/library-2026-11-20.db';\n```\n\n## Why it works as a backup\n\nThe copy is a consistent snapshot, because the statement runs inside a read transaction. Writers wait only for a moment, and the copy is smaller than the original because free pages are left out. A file copy of a database in WAL mode can miss pages that live only in the log, and this command cannot.\n\n## What to check\n\nThe target file must not exist, so a script should name each copy with the date. Open the copy and run `PRAGMA integrity_check` before you trust it, and keep the last few copies instead of overwriting one. Restore the newest copy onto a spare machine once in a while, so you know the procedure works before you need it.",
    },
    digest: {
      title: "VACUUM INTO as a backup that does not block writers",
      topic: "Databases",
      tags: ["sqlite", "backups"],
      summary:
        "VACUUM INTO makes a compact copy of a live SQLite database.\nWriters wait only briefly, and the copy leaves out free pages.",
      keyPoints: ["The copy is smaller than the original file."],
    },
  },
  {
    key: "margins",
    accent: "iris",
    url: "https://kerning.example/optical-margins",
    page: {
      title: "Optical margins",
      author: "Kerning",
      markdown:
        "Hanging punctuation moves quotation marks and hyphens outside the text block, so the edge of the column looks straight even when a line starts with a quote. Print has done this for centuries, and the web is still catching up.\n\n## What browsers do\n\n`hanging-punctuation` works in Safari only. Chrome and Firefox ignore it, so the effect is an enhancement, not a requirement, and the page must still read well without it.\n\n## A fallback\n\nFor a pull quote you control, a negative `text-indent` of one character width gives the same result in every browser. Set it only on the elements that start with a quotation mark, and test it with a screen reader, because a changed first character must not change what is announced.\n\n> Optical alignment is about the eye, not the box. The box stays where it is, and the ink moves.\n\nMeasure the result at a narrow width as well, since the gain is largest in short lines.",
    },
    digest: {
      title: "Optical margin alignment in a web reading column",
      topic: "Typography",
      tags: ["hyphenation", "measure"],
      summary:
        "Hanging punctuation makes the edge of a column look straight.\nBrowsers support only part of it.",
      keyPoints: ["`hanging-punctuation` works in Safari only."],
    },
  },
  {
    key: "versions",
    accent: "rust",
    url: "https://localfirst.example/show-both-versions",
    page: {
      title: "Show both versions",
      author: "Local First",
      markdown:
        "When two devices edit one note offline, a merge that picks a winner loses an edit. Whichever rule you choose, one person finds a sentence missing the next morning, and they do not trust the app after that.\n\n## Show both\n\nShow both versions side by side and let the person choose. It costs one screen, and it removes the largest class of support requests we had in the first year.\n\n## What the screen needs\n\n- The two versions, each labeled with the device and the time of its last edit.\n- A choice to keep one, or to keep both as separate notes.\n- No timer. The conflict waits until the person looks at it.\n\nThe rest of the work is storing enough history to show the older version. A short log of changes per note is enough, and it doubles as the undo list.\n\nWe expected people to dislike the extra step. Most of them chose in a few seconds, and almost none asked for an automatic merge afterwards.",
    },
    digest: {
      title: "Show both versions of a conflicting note and let the person choose",
      topic: "Local-first software",
      tags: ["conflicts", "sync"],
      summary:
        "A merge that picks a winner loses an edit on one device.\nShowing both versions costs one screen and removes the largest class of support mail.",
      keyPoints: ["Side-by-side versions replace a clever merge."],
    },
  },
  {
    key: "log",
    accent: "cobalt",
    url: "https://localfirst.example/an-append-only-log",
    read: true,
    page: {
      title: "Why we replaced the sync engine with a log",
      author: "Local First",
      markdown:
        "An append-only log of changes per device is easier to reason about than a merged document. Each device writes only its own log, so two devices never write the same file and a sync tool has nothing to merge.\n\n## Replay\n\nReplaying the log rebuilds any note at any point in time. A device that was offline for a month catches up in one pass: it reads the other logs from the last position it saw and applies them in order.\n\n## Costs\n\nThe log grows without bound, so each device writes a snapshot every few thousand entries and drops the entries before it. Deleting a note is another entry, not a removal, until every device has seen it.\n\n> The document is a view. The log is the data.\n\nWe replaced a merge engine of about four thousand lines with a log reader of about four hundred, and the bugs we had after that were bugs of ordinary code, not of distributed state.",
    },
    digest: {
      title: "An append-only log per device in place of a merged document",
      topic: "Local-first software",
      tags: ["sync", "logs"],
      summary:
        "A log of changes per device rebuilds any note by replay.\nA device offline for a month catches up in one pass.",
      keyPoints: ["Replaying the log rebuilds any note."],
    },
  },
  {
    key: "stabilizers",
    accent: "moss",
    url: "https://keebworkshop.example/stabilizer-tuning",
    page: {
      title: "Tuning a stabilizer in five minutes",
      author: "Keeb Workshop",
      markdown:
        "Clip the stabilizer legs, add a thin film of grease to the wire ends, and seat the wire fully in the housing before you press the keycap on. The whole job takes five minutes per board once you have done it twice.\n\n## Why it rattles\n\nMost rattle comes from a wire that is only half seated. The wire should click into both housings and sit flat. A wire that rides up on one side taps the plastic on every keypress.\n\n## Steps\n\n1. Clip the small plastic legs with flush cutters, then sand the stubs flat.\n2. Put a rice grain of dielectric grease on each wire end, not on the housing.\n3. Push the wire into the housing until it clicks, and check that it sits level.\n4. Press the keycap on, and tap the key at the far end of the bar.\n\nIf it still rattles, the wire is bent. Lay it on a flat surface and straighten it before you try again.",
    },
    digest: {
      title: "Tuning a rattling stabilizer in five minutes",
      topic: "Keyboards",
      tags: ["stabilizers"],
      summary:
        "Most stabilizer rattle comes from a wire that is only half seated.\nGrease on the wire ends and a full seat fix most of it.",
      keyPoints: ["Seat the wire fully before you press the keycap on."],
    },
  },
];

export const HIGHLIGHTS: readonly SeedHighlight[] = [
  { key: "stabilizers", exact: "Most rattle comes from a wire that is only half seated." },
  { key: "backups", exact: "In eight months it found two things" },
];

export const NOTES: ReadonlyMap<string, string> = new Map([
  ["stabilizers", "Seat the wire again on the second board before lubing the switches."],
  ["backups", "Add a calendar reminder for the first Sunday of the month."],
]);
