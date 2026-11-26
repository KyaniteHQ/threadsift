export const topics = ["Home servers", "Databases", "Typography", "Local-first software", "Keyboards", "Personal finance"];
export const topicHue = { "Home servers": 230, Databases: 30, Typography: 330, "Local-first software": 150, Keyboards: 75, "Personal finance": 105 };

export const items = [
  {
    id: "mini-pc",
    url: "https://www.reddit.com/r/homeserverlog/comments/1p2k8d/moved_my_media_server_off_a_fourbay_nas_to_a/",
    source: "reddit",
    community: "homeserverlog",
    author: "tallow_and_tin",
    title: "Moved my media server off a four-bay NAS to a mini PC. What I would do differently",
    saved: "24 Nov",
    read: false,
    digest: true,
    savedComments: 64,
    topic: "Home servers",
    tags: [{ name: "power draw", hue: 1 }, { name: "transcoding", hue: 4 }, { name: "backups", hue: 6 }],
    summary:
      "A mini PC with an external drive shelf replaced a four-bay NAS and cut idle power by about half. The kept comments agree on one warning: plan the backup path before the move, not after.",
    keyPoints: [
      "Idle draw fell from 38 W to 17 W, measured at the wall over a week.",
      "Hardware transcoding works once the render device is passed to the container.",
      "A USB drive shelf drops off under load unless its power saving is turned off.",
      "Two commenters lost a day to permissions after copying with the wrong flags.",
    ],
    post: [
      "I ran a four-bay NAS for six years. It worked, but it was loud, it idled at 38 W, and the CPU could not transcode one 4K stream. Last month I moved everything to a small mini PC with a five-drive USB shelf.",
      "What went well: the media server now transcodes three streams at once, and idle power at the wall is 17 W. What did not: the drive shelf disconnected twice during the first big copy, and I had no tested backup at that point.",
      "If I did it again I would set up the off-site backup first, copy with checksums, and only then retire the NAS.",
    ],
    comments: [
      {
        a: "brindle_ops",
        age: "3 d",
        text: "The disconnects are almost always USB autosuspend. Turn it off for the shelf's controller and the drops stop. I ran the same shelf for a year after that with no drop.",
        kids: [
          {
            a: "tallow_and_tin",
            age: "3 d",
            text: "That was it. With autosuspend off, the 9 TB copy finished in one pass.",
            kids: [],
          },
        ],
      },
      {
        stub: "parent",
        kids: [
          {
            a: "quarry_lane",
            age: "2 d",
            text: "Copy with checksums and keep owners and modes. I lost a day to permissions because I copied as root without keeping them, and every container then failed to read its config.",
            kids: [
              {
                a: "oddly_specific",
                age: "2 d",
                text: "Same here. A second pass that compares checksums is slow, but it is the only proof that the copy is complete.",
                kids: [{ stub: "more", n: 14 }],
              },
            ],
          },
        ],
      },
      {
        a: "fernhollow",
        age: "1 d",
        text: "Counterpoint: a NAS gives you hot-swap bays and one vendor to blame. A mini PC with a USB shelf is cheaper but you own every failure.",
        kids: [],
      },
    ],
  },
  {
    id: "rack",
    url: "https://www.reddit.com/r/rackandstack/comments/1o9x4f/one_year_of_the_small_rack_power_down_to_61_w/",
    source: "reddit",
    community: "rackandstack",
    author: "lowvoltage_lou",
    title: "One year of the small rack: power down to 61 W after replacing two switches",
    saved: "21 Nov",
    read: true,
    digest: true,
    savedComments: 92,
    topic: "Home servers",
    tags: [{ name: "power draw", hue: 1 }, { name: "networking", hue: 5 }],
    picture: { kind: "rack", hue: 230 },
    summary:
      "Replacing two old managed switches with one fanless switch took the rack from 104 W to 61 W. Commenters add that the savings depend on how many ports run at full speed.",
    keyPoints: [
      "The two old switches drew 39 W together; the new one draws 9 W.",
      "Unused ports set to off save about 0.5 W each.",
      "A smart plug with logging is enough to measure the change.",
    ],
    post: [
      "A year ago this rack drew 104 W at idle. After replacing two older managed switches with one fanless switch and turning off unused ports, it now sits at 61 W.",
    ],
    comments: [
      {
        a: "gridwatcher",
        age: "6 d",
        text: "Port speed matters more than people think. A port at 10 Gb/s over copper can use 3 W on its own.",
        kids: [
          {
            a: "lowvoltage_lou",
            age: "6 d",
            text: "Good point. Two of my uplinks run at 10 Gb/s over copper; moving them to fibre modules is next.",
            kids: [],
          },
        ],
      },
      {
        a: "amp_hour_annie",
        age: "5 d",
        text: "A smart plug that logs every minute is enough to see the change. Measure a full week, because backups and scrubs move the average.",
        kids: [],
      },
    ],
  },
  {
    id: "sqlite-wal",
    url: "https://www.reddit.com/r/sqlitenotes/comments/1p6c2m/wal_mode_and_a_network_drive_why_my_apps/",
    source: "reddit",
    community: "sqlitenotes",
    author: "page_cache",
    title: "WAL mode and a network drive: why my app's database kept locking",
    saved: "25 Nov",
    read: false,
    digest: false,
    savedComments: 57,
    topic: "Databases",
    tags: [],
    summary: null,
    keyPoints: [],
    post: [
      "My small app keeps its database on a network share so two machines can use it. Since I turned on WAL mode, writes fail with a lock error a few times a day.",
      "Is WAL mode safe on a network drive at all, or should I move the database to one machine and put a small server in front of it?",
    ],
    comments: [
      {
        a: "btree_bert",
        age: "1 d",
        text: "WAL mode needs shared memory between the processes, and a network file system cannot give you that. Keep the database on the machine that writes to it.",
        kids: [
          {
            a: "page_cache",
            age: "1 d",
            text: "So the second machine should talk to the first one over HTTP instead of opening the file?",
            kids: [
              {
                a: "btree_bert",
                age: "1 d",
                text: "Yes. Or use rollback journal mode and accept slower writes, but locking over a share is still unreliable.",
                kids: [],
              },
            ],
          },
        ],
      },
      { stub: "more", n: 26 },
    ],
  },
  {
    id: "mail-outage",
    url: "https://www.reddit.com/r/mailcellar/comments/1p8h5t/three_days_without_mail_because_of_one_dns/",
    source: "reddit",
    community: "mailcellar",
    author: "spf_and_sorrow",
    title: "Three days without mail because of one DNS record: my write-up",
    saved: "17 Nov",
    read: false,
    digest: true,
    savedComments: 48,
    topic: "Home servers",
    tags: [{ name: "dns", hue: 5 }, { name: "email", hue: 3 }],
    summary:
      "A link to a write-up of a self-hosted mail outage traced to an expired DNS record. The kept comments add a monitoring check and one counterpoint about running mail at home.",
    keyPoints: ["The record had a short lifetime and nobody owned its renewal.", "A daily check of the published records would have caught it in hours."],
    linkTo: "notes.example/mail-outage",
    post: [],
    comments: [
      {
        a: "mx_lookup",
        age: "9 d",
        text: "Put a daily check on every record your mail depends on and alert on any change, not only on failure. A changed record is the early warning; a bounced message is the late one.",
        kids: [{ a: "spf_and_sorrow", age: "9 d", text: "Adding that this week. The check is ten lines of shell.", kids: [] }],
      },
      {
        a: "relay_rhonda",
        age: "8 d",
        text: "Counterpoint: this is why I send through a relay and only receive at home. Outbound mail is where the deliverability pain lives.",
        kids: [],
      },
      { stub: "more", n: 19 },
    ],
  },
  {
    id: "kerning-comment",
    url: "https://www.reddit.com/r/typesetters/comments/1n4r7q/comment/kz81wd/",
    source: "reddit",
    kind: "comment",
    community: "typesetters",
    author: "ligature_lena",
    title: "Comment on: Why do my headings look loose even with tracking at zero?",
    saved: "19 Nov",
    read: true,
    digest: true,
    savedComments: 0,
    topic: "Typography",
    tags: [{ name: "headings", hue: 2 }, { name: "spacing", hue: 7 }],
    summary:
      "Large type needs negative tracking because a face's default spacing is tuned for text sizes. The comment gives a working range and a test.",
    keyPoints: ["Start at -0.01em for headings and go down to -0.03em for display sizes.", "Check with real words, not the alphabet."],
    post: [
      "Spacing in a font is set for reading sizes. At 40 px the same gaps look wide, so headings need a little negative tracking. Start around -0.01em and test with your real headings, not with sample text, because round letters and straight letters space differently.",
    ],
    parentStub: true,
    comments: [],
  },
  {
    id: "local-first",
    url: "https://x.com/mirela_ships/status/1859203314455102218",
    source: "x",
    handle: "mirela_ships",
    author: "Mirela Vos",
    title: "What I learned shipping a local-first notes app to 2,000 people",
    saved: "23 Nov",
    read: false,
    digest: true,
    savedComments: 37,
    topic: "Local-first software",
    tags: [{ name: "sync", hue: 3 }, { name: "conflicts", hue: 0 }],
    picture: { kind: "blocks", hue: 150 },
    summary:
      "A thread on the parts of local-first sync that took longest: merging edits from two offline devices and telling people what happened. Replies add two libraries and one failure case.",
    keyPoints: [
      "Most conflicts were the same note edited on a phone and a laptop while offline.",
      "Showing both versions side by side cut support mail more than any merge rule.",
      "A reply notes that clock skew broke last-writer-wins on old tablets.",
    ],
    post: ["Shipped a local-first notes app to about 2,000 people this year. A few things I did not expect:"],
    thread: [
      "1. Sync was not the hard part. Conflicts were. Nearly all of them were one note edited on two devices while both were offline.",
      "2. People do not want a clever merge. They want to see both versions and pick. Support mail about lost text dropped to almost zero after we showed both.",
      "3. Test on old devices. Our cheapest tablet had a clock that drifted by minutes.",
    ],
    comments: [
      {
        a: "@ohm_and_order",
        age: "2 d",
        text: "Clock drift bit us too. We moved from timestamps to a counter per device and the odd overwrites stopped.",
        kids: [],
      },
      {
        a: "@paperjam_dev",
        age: "2 d",
        text: "Did you look at keeping an operation log instead of whole note versions? It made our side-by-side view much cheaper to build.",
        kids: [{ a: "@mirela_ships", age: "2 d", text: "We keep both: the log for sync, the versions for the view.", kids: [] }],
      },
    ],
  },
  {
    id: "x-short",
    url: "https://x.com/ferro_fern/status/1858471100293846016",
    source: "x",
    handle: "ferro_fern",
    author: "Ferro Fernández",
    title: "A rule I keep for side projects: every feature must survive one week of me not touching it",
    saved: "18 Nov",
    read: true,
    digest: false,
    savedComments: 12,
    topic: "Local-first software",
    tags: [],
    summary: null,
    keyPoints: [],
    post: [
      "A rule I keep for side projects: every feature must survive one week of me not touching it. If it breaks on its own, it was not done. Most of mine failed on the same four things: a cron job, a certificate, disk space and an expired API token. Each of those now gets an alert before the project gets a new feature.",
    ],
    comments: [
      { a: "@ninefold", age: "8 d", text: "Same idea as a cron job you never have to think about.", kids: [] },
      {
        a: "@slow_compile",
        age: "8 d",
        text: "I use two weeks. One week still catches the things I fix without noticing.",
        kids: [{ a: "@ferro_fern", age: "7 d", text: "Two weeks is fairer. A holiday is the real test.", kids: [] }],
      },
    ],
  },
  {
    id: "tidepool",
    url: "https://github.com/sundry-kettle/tidepool",
    source: "github",
    repo: "sundry-kettle/tidepool",
    author: "sundry-kettle",
    title: "tidepool: a small job queue on top of SQLite, with retries and a dashboard you can turn off",
    saved: "22 Nov",
    read: false,
    digest: true,
    savedComments: 0,
    language: "Rust",
    stars: "2.1k",
    updated: "4 days ago",
    topic: "Databases",
    tags: [{ name: "job queue", hue: 4 }, { name: "sqlite", hue: 5 }],
    description: "Background jobs for small services, kept in one SQLite file. No broker to run.",
    summary:
      "A job queue that keeps its state in one SQLite file. It retries failed jobs with backoff and ships an optional web view of the queue.",
    keyPoints: ["One file holds jobs, attempts and results.", "Retries back off up to a limit you set per job kind.", "The web view is a separate feature flag."],
    post: [
      "tidepool runs background jobs for small services without a separate broker. Jobs, attempts and results live in one SQLite file, so a backup is a file copy.",
      "Install it with cargo, point it at a file, and register a handler per job kind.",
    ],
    comments: [],
  },
  {
    id: "snapshot-diff",
    url: "https://github.com/oxbow-tooling/pg-snapshot-diff",
    source: "github",
    repo: "oxbow-tooling/pg-snapshot-diff",
    author: "oxbow-tooling",
    title: "pg-snapshot-diff: compare two database snapshots and print the rows that changed",
    saved: "16 Nov",
    read: true,
    digest: true,
    savedComments: 0,
    language: "Go",
    stars: "640",
    description: "Diff two Postgres dumps table by table.",
    updated: "3 weeks ago",
    topic: "Databases",
    tags: [{ name: "postgres", hue: 5 }],
    summary: "A command-line tool that reads two snapshots and prints inserted, changed and deleted rows per table.",
    keyPoints: ["Works on dumps, not live servers.", "Prints a summary first, then the rows."],
    post: ["Give it two dump files and it prints, table by table, the rows that were inserted, changed or deleted."],
    comments: [],
  },
  {
    id: "boring-formats",
    url: "https://fieldnotes.example/boring-storage-formats",
    source: "article",
    domain: "fieldnotes.example",
    site: "Field Notes",
    readingTime: "7 min",
    author: "Ines Halloran",
    title: "The case for boring storage formats",
    saved: "20 Nov",
    read: false,
    digest: true,
    savedComments: 0,
    topic: "Local-first software",
    tags: [{ name: "file formats", hue: 2 }, { name: "archiving", hue: 6 }],
    picture: { kind: "terrain", hue: 200 },
    summary:
      "Plain text, CSV and SQLite outlive the apps that write them. The essay argues for picking a format by how easily a stranger could read it in twenty years.",
    keyPoints: ["A format is only as durable as its simplest reader.", "Keep an export path even when the app is the main reader."],
    post: [
      "Every app I loved in 2010 is gone, but the plain text files it wrote still open. That is the whole argument: choose formats by how easily someone else could read them without your app.",
      "This does not mean everything should be text. A single SQLite file is a fine archive, because its format is documented and stable. What fails is the format only one program understands.",
    ],
    comments: [],
  },
  {
    id: "long-threads",
    url: "https://margins.example/2026/reading-long-threads",
    source: "article",
    domain: "margins.example",
    site: "Margins",
    readingTime: "4 min",
    author: "Tomas Okafor",
    title: "Reading long threads without losing the plot",
    saved: "14 Nov",
    read: true,
    digest: true,
    savedComments: 0,
    topic: "Typography",
    tags: [{ name: "reading", hue: 7 }],
    summary: "Indentation, a capped depth and one line for every skipped reply keep a long thread readable.",
    keyPoints: ["Cap the indent so deep replies keep a readable width.", "Show a one-line note where replies were left out."],
    post: ["A thread of three hundred replies is not read; it is skimmed. Three habits help: indent replies, cap the indent, and mark every place where something was left out with one quiet line."],
    comments: [],
  },
  {
    id: "stabilizers",
    url: "https://www.reddit.com/r/keebworkshop/comments/1q7w3e/lubing_stabilizers_without_a_kit/",
    source: "reddit",
    linkOnly: true,
    community: "keebworkshop",
    author: null,
    title: "Lubing stabilizers without a kit",
    saved: "25 Nov",
    read: false,
    digest: false,
    savedComments: 0,
    topic: "Keyboards",
    tags: [],
    summary: null,
    keyPoints: [],
    post: [],
    comments: [],
  },
  {
    id: "plain-ledger",
    url: "https://tools.example/guides/plain-text-accounting",
    source: "other",
    domain: "tools.example",
    author: null,
    title: "A plain-text accounting primer",
    saved: "11 Nov",
    read: true,
    digest: true,
    savedComments: 0,
    topic: "Personal finance",
    tags: [{ name: "plain text", hue: 2 }],
    site: "Plain Tools",
    readingTime: "9 min",
    summary: "Double-entry bookkeeping in a text file: one transaction per paragraph, checked by a small command-line tool.",
    keyPoints: ["Every transaction balances to zero.", "The file is the database, so version control is the history."],
    post: ["Each transaction is a date, a description and two or more postings that add up to zero. A command-line tool reads the file and prints balances."],
    comments: [],
  },
];

const EXCERPT_MAX = 400;
const firstShown = (list) => {
  for (const c of list) {
    const found = c.a ? c : firstShown(c.kids ?? []);
    if (found) return found;
  }
  return null;
};
const opening = (it) => (it.source === "article" || it.source === "other" ? it.post.slice(0, 1) : it.post).join(" ");
function upToSentence(text) {
  if (text.length <= EXCERPT_MAX) return text;
  const cut = text.slice(0, EXCERPT_MAX);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  if (end > 0) return cut.slice(0, end + 1);
  const space = cut.lastIndexOf(" ");
  return `${space > 0 ? cut.slice(0, space) : cut}…`;
}
for (const it of items) {
  const { host, pathname } = new URL(it.url);
  it.host = host;
  it.path = pathname;
  it.excerpt = upToSentence(opening(it));
  const kept = it.source === "reddit" && it.digest ? firstShown(it.comments) : null;
  it.firstKept = kept && { author: kept.a, text: kept.text };
}
