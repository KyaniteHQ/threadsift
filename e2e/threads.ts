import { type APIRequestContext, expect } from "@playwright/test";
import { z } from "zod";

import { SavedItemResponseSchema } from "../src/http/schemas.ts";
import type { Instance } from "./access.ts";
import { settled } from "./api.ts";

const POST_CREATED = 1_700_000_000;

export type Node =
  | {
      readonly kind: "comment";
      readonly id: string;
      readonly author: string;
      readonly body: string;
      readonly replies: readonly Node[];
    }
  | { readonly kind: "more"; readonly children: readonly string[] };

export function comment(
  id: string,
  author: string,
  body: string,
  replies: readonly Node[] = [],
): Node {
  return { kind: "comment", id, author, body, replies };
}

export const MORE: Node = { kind: "more", children: ["x1", "x2", "x3"] };

export function more(...children: readonly string[]): Node {
  return { kind: "more", children };
}

export interface Post {
  readonly id: string;
  readonly title: string;
  readonly author: string;
  readonly subreddit: string;
  readonly selftext: string;
  readonly reported: number;
}

function wireChildren(nodes: readonly Node[], parent: string, counter: { next: number }): object[] {
  return nodes.map((node) => {
    if (node.kind === "more") {
      return {
        kind: "more",
        data: { parent_id: parent, count: node.children.length, children: node.children },
      };
    }

    counter.next += 1;

    return {
      kind: "t1",
      data: {
        id: node.id,
        name: `t1_${node.id}`,
        author: node.author,
        body: node.body,
        body_html: "<p>html</p>",
        parent_id: parent,
        link_id: "t3_post",
        score: counter.next,
        created_utc: POST_CREATED + 100 + counter.next,
        replies:
          node.replies.length === 0
            ? ""
            : {
                kind: "Listing",
                data: { children: wireChildren(node.replies, `t1_${node.id}`, counter) },
              },
      },
    };
  });
}

function postListing(post: Readonly<Post>) {
  return {
    kind: "Listing",
    data: {
      children: [
        {
          kind: "t3",
          data: {
            id: post.id,
            name: `t3_${post.id}`,
            title: post.title,
            author: post.author,
            subreddit: post.subreddit,
            selftext: post.selftext,
            num_comments: post.reported,
            created_utc: POST_CREATED,
          },
        },
      ],
    },
  };
}

export function postOnlyJson(post: Readonly<Post>): string {
  return JSON.stringify([postListing(post)]);
}

export function threadJson(
  post: Readonly<Post>,
  tree: readonly Node[],
  topParent = `t3_${post.id}`,
): string {
  return JSON.stringify([
    postListing(post),
    {
      kind: "Listing",
      data: { children: wireChildren(tree, topParent, { next: 0 }) },
    },
  ]);
}

export const AUTHORED_DIGEST = {
  title: "Authored thread title",
  topic: "Reading",
  tags: ["Notebooks"],
  summary: "An owner-authored thread proves the input contract.",
  keyPoints: ["The caller chooses the Kept comments."],
} as const;

export async function sendThread(
  request: APIRequestContext,
  fields: Readonly<{ url: string; content: string | readonly string[]; digest?: object }>,
) {
  const response = await request.post("/api/items", { data: fields });

  return { status: response.status(), response };
}

export async function savedThread(
  request: APIRequestContext,
  fields: Readonly<{ url: string; content: string | readonly string[]; digest?: object }>,
) {
  const { status, response } = await sendThread(request, fields);
  expect(status, await response.text()).toBeLessThan(300);
  const { item } = SavedItemResponseSchema.parse(await response.json());

  return { status, item: await settled(request, item.id) };
}

const Rows = z.array(
  z.object({
    id: z.string(),
    generation: z.number(),
    kept: z.number(),
    eligible: z.number(),
    kind: z.string(),
    hasBody: z.number(),
  }),
);

export function commentRows(instance: Instance, itemId: number) {
  return instance.query(
    `SELECT id, generation, kept, eligible, kind, body IS NOT NULL AS hasBody FROM reddit_comments WHERE item_id = ${itemId} ORDER BY generation, position`,
    Rows,
  );
}

const Generation = z.array(z.object({ generation: z.number() }));

export function generationOf(instance: Instance, itemId: number): number {
  return (
    instance.query(`SELECT generation FROM items WHERE id = ${itemId}`, Generation)[0]
      ?.generation ?? -1
  );
}
