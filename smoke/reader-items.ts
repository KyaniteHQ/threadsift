const THREAD_ID = "3000000000000000001";

export const THREAD_LINK = `https://x.com/oldname/status/${THREAD_ID}`;

const STATUS_ID = "3000000000000000002";

export const STATUS_LINK = `https://x.com/i/status/${STATUS_ID}`;

export const STATUS_TITLE = "A status link that names no handle";

export const THREAD_TITLE = "Online backups for a busy database file";

export const FACT =
  "Run sqlite3 app.db '.backup copy.db', then run PRAGMA integrity_check on the copy.";

const reply = (id: string, parentId: string, author: string, text: string) => ({
  id,
  parentId,
  author,
  text,
  postedAt: "2026-03-04T10:00:00Z",
  likes: 2,
});

export const THREAD = {
  post: {
    id: THREAD_ID,
    author: "someone",
    text: "How do you back up a SQLite file while the app is writing to it?",
    postedAt: "2026-03-04T09:00:00Z",
    replies: 3,
  },
  replies: [
    reply("3000000000000000011", THREAD_ID, "bob", FACT),
    reply("3000000000000000012", "3000000000000000011", "Someone", "That also works from Python."),
    reply("3000000000000000013", THREAD_ID, "carol", "lol"),
  ],
};

export const STATUS_POST = {
  post: {
    id: STATUS_ID,
    author: "someone",
    text: "Does the online backup command lock the database while it copies?",
    postedAt: "2026-03-05T09:00:00Z",
    replies: 0,
  },
  replies: [],
};

export const STALE_LINK = "https://example.com/guides/stale-reader";

export const STALE_TITLE = "A page the Reader keeps an earlier copy of";

export const FIRST_COPY = "The first copy of a page that the Reader keeps on screen.";

export const FIRST_TEXT = Array.from({ length: 24 }, () => FIRST_COPY).join("\n\n");
