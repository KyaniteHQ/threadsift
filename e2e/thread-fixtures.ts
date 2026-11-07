import type { APIRequestContext } from "@playwright/test";

import { newRunId } from "./links.ts";
import { matches } from "./search.ts";
import { AUTHORED_DIGEST, MORE, type Post, comment } from "./threads.ts";

export const run = newRunId();

export const SUBREDDIT = "threadsifttests";

export function marker(name: string, tag = ""): string {
  return `${name}${tag}marker${run}`;
}

export function post(id: string, selftext: string, reported = 142): Post {
  return {
    id,
    title: `Authored thread ${id}`,
    author: "author_one",
    subreddit: SUBREDDIT,
    selftext,
    reported,
  };
}

export function postUrl(id: string): string {
  return `https://www.reddit.com/r/${SUBREDDIT}/comments/${id}/authored_thread/`;
}

export function normalized(id: string): string {
  return `https://reddit.com/r/all/comments/${id}/`;
}

export function find(request: APIRequestContext, word: string): Promise<number[]> {
  return matches(request, word);
}

export function firstTree(tag: string) {
  return [
    comment("c1", "reader_a", `${marker("kept", tag)} Set the cache path before the first run.`, [
      comment("c2", "AutoModerator", `${marker("dropped", tag)} Please read the rules.`, [
        comment(
          "c3",
          "reader_b",
          `${marker("deep", tag)} Pointing the path at tmpfs fixed it for me.`,
        ),
      ]),
      comment("c4", "reader_c", "+1"),
      comment("c5", "reader_d", `${marker("unkept", tag)} A perfectly ordinary remark.`, [MORE]),
      MORE,
    ]),
    comment("c6", "reader_e", "[deleted]", [
      comment(
        "c7",
        "reader_f",
        `${marker("stubbed", tag)} I ran it for three weeks without a crash.`,
      ),
      MORE,
    ]),
    MORE,
  ];
}

export const FIRST_DIGEST = {
  ...AUTHORED_DIGEST,
  keptComments: ["t1_c1", "t1_c3", "t1_c7", "t1_c1", "t1_c4", "t1_unknown"],
};

export const FIRST_NODES: object[] = [
  { kind: "comment", id: "t1_c1", parentId: null, depth: 0, author: "reader_a" },
  { kind: "stub", id: "t1_c2", parentId: "t1_c1", depth: 1, reason: "dropped" },
  { kind: "comment", id: "t1_c3", parentId: "t1_c2", depth: 2, author: "reader_b" },
  { kind: "more", id: "more_6", parentId: "t1_c1", depth: 1 },
  { kind: "stub", id: "t1_c6", parentId: null, depth: 0, reason: "dropped" },
  { kind: "comment", id: "t1_c7", parentId: "t1_c6", depth: 1, author: "reader_f" },
  { kind: "more", id: "more_9", parentId: "t1_c6", depth: 1 },
  { kind: "more", id: "more_10", parentId: null, depth: 0 },
];

export const FIRST_ROWS = [
  ["t1_c1", 1, 1, 1],
  ["t1_c2", 0, 0, 0],
  ["t1_c3", 1, 1, 1],
  ["t1_c4", 0, 0, 0],
  ["t1_c5", 0, 1, 1],
  ["more_5", 0, 0, 0],
  ["more_6", 0, 0, 0],
  ["t1_c6", 0, 0, 0],
  ["t1_c7", 1, 1, 1],
  ["more_9", 0, 0, 0],
  ["more_10", 0, 0, 0],
];
