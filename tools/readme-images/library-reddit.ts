import type { SeedItem } from "./seed-types.ts";
import { reddit } from "./seed-wire.ts";

const FOUR_BAY = reddit({
  id: "q1",
  subreddit: "homeserverlog",
  title: "Moved my media server off a four-bay NAS to a mini PC. What I would do differently",
  author: "tallow_and_tin",
  text: "I ran a four-bay NAS for six years. It worked, but it was loud, it idled at 38 W, and the CPU could not transcode one 4K stream.\n\nIf I did it again I would set up the off-site backup first, copy with checksums, and only then retire the NAS.",
  total: 64,
  comments: [
    {
      id: "k1",
      author: "brindle_ops",
      score: 128,
      body: "The disconnects are almost always USB autosuspend. Turn it off for the shelf's controller and the drops stop.",
      replies: [
        {
          id: "k2",
          author: "tallow_and_tin",
          score: 41,
          body: "That was it. With autosuspend off, the 9 TB copy finished in one pass.",
        },
      ],
    },
    {
      id: "d1",
      author: "drifting_byte",
      score: 3,
      body: "Did you try a different cable first?",
      replies: [
        {
          id: "k3",
          author: "quarry_lane",
          score: 64,
          body: "I ran the same shelf for a year and logged every drop. Every drop came right after the controller went idle, and turning off autosuspend for that one controller fixed it while the rest of the bus kept its power saving.",
          replies: [
            {
              id: "k4",
              author: "oddly_specific",
              score: 22,
              body: "Same here. A second pass that compares checksums is slow, but it is the only proof that the copy is complete.",
            },
          ],
        },
      ],
    },
    {
      id: "k5",
      author: "fernhollow",
      score: 17,
      body: "Counterpoint: a NAS gives you hot-swap bays and one vendor to blame. A mini PC with a USB shelf is cheaper, but you own every failure.",
    },
  ],
});

const WAL = reddit({
  id: "q2",
  subreddit: "sqlitenotes",
  title: "WAL mode and a network drive: why my app's database kept locking",
  author: "page_cache",
  text: "My small app keeps its database on a network share so two machines can use it. Since I turned on WAL mode, writes fail with a lock error a few times a day.",
  total: 57,
  comments: [
    {
      id: "w1",
      author: "btree_bert",
      score: 212,
      body: "WAL mode needs shared memory between the processes, and a network file system cannot give you that. Keep the file on a local disk.",
      replies: [
        {
          id: "w2",
          author: "page_cache",
          score: 31,
          body: "So the second machine should talk to the first one over HTTP instead of opening the file?",
          replies: [
            {
              id: "w3",
              author: "btree_bert",
              score: 88,
              body: "Yes. One process owns the file, and everything else asks it. It took me an afternoon to move over and the locks stopped.",
            },
          ],
        },
      ],
    },
    { id: "w4", author: "rollback_rita", score: 9, body: "lol just use postgres" },
  ],
});

const KEEBS = reddit({
  id: "q3",
  subreddit: "keebworkshop",
  title: "Six months on Hall effect switches: what held up and what did not",
  author: "stem_and_spring",
  text: "Every switch still registers cleanly. The adjustable actuation point stayed at 1.2 mm the whole time, and I never went back to the default.\n\nThe one failure was a stabilizer wire that rattled from the first day.",
  total: 31,
  comments: [
    {
      id: "h1",
      author: "dampened_dave",
      score: 54,
      body: "Rattling stabilizer wires usually need a dab of dielectric grease on the wire ends, not on the housing. It fixed mine in two minutes.",
    },
    {
      id: "h2",
      author: "lowprofile_lena",
      score: 19,
      body: "The adjustable actuation is the real feature. I set 0.8 mm for the home row and 1.6 mm for the rest, and my typos dropped.",
    },
  ],
});

export const REDDIT_ITEMS: readonly SeedItem[] = [
  {
    key: "four-bay",
    url: "https://www.reddit.com/r/homeserverlog/comments/q1/moved_my_media_server/",
    content: FOUR_BAY,
    digest: {
      title: "Moved my media server off a four-bay NAS to a mini PC. What I would do differently",
      topic: "Home servers",
      tags: ["power draw", "transcoding", "backups"],
      summary:
        "A mini PC with an external drive shelf replaced a four-bay NAS and cut idle power by about half.\nThe kept comments agree on one warning: plan the backup path before the move.",
      keyPoints: [
        "Idle draw fell from 38 W to 17 W, measured at the wall over a week.",
        "Hardware transcoding works once the render device is passed to the container.",
        "A USB drive shelf drops off under load unless its power saving is turned off.",
      ],
      keptComments: ["k1", "k2", "k3", "k4", "k5"],
    },
  },
  {
    key: "wal",
    url: "https://www.reddit.com/r/sqlitenotes/comments/q2/wal_mode_and_a_network_drive/",
    content: WAL,
    read: true,
    digest: {
      title: "WAL mode and a network drive: why the app's database kept locking",
      topic: "Databases",
      tags: ["sqlite", "network file systems"],
      summary:
        "WAL keeps an index in shared memory, which a network file system cannot share between machines.\nThe fix is one process that owns the file and answers the others over HTTP.",
      keyPoints: [
        "SMB and NFS cannot give two machines the shared memory that WAL needs.",
        "Keep the database file on a local disk.",
        "Moving to a small server in front of the file took one afternoon.",
      ],
      keptComments: ["w1", "w2", "w3"],
    },
  },
  {
    key: "keebs",
    url: "https://www.reddit.com/r/keebworkshop/comments/q3/six_months_on_hall_effect_switches/",
    content: KEEBS,
    digest: {
      title: "Hall effect switches after six months of daily use",
      topic: "Keyboards",
      tags: ["switches", "stabilizers"],
      summary:
        "The switches held up, and the adjustable actuation point stayed in use.\nThe only failure was a stabilizer wire, which grease on the wire ends fixed.",
      keyPoints: [
        "An actuation point of 1.2 mm stayed comfortable for six months.",
        "Per-key actuation cut typos on the home row.",
        "Grease goes on the wire ends of a rattling stabilizer, not on the housing.",
      ],
      keptComments: ["h1", "h2"],
    },
  },
];
