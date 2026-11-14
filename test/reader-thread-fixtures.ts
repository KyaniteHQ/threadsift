import type { CommentsView } from "../src/core/comment-view.ts";
import { ItemReadResponseSchema, SavedItemResponseSchema } from "../src/http/schemas.ts";
import type { Instance, Json } from "./instance.ts";

export const TARGET = "http://127.0.0.1:9/page";

export const FACT =
  "Run sqlite3 app.db '.backup copy.db' while writers are busy, then check the copy.";

export const comment = (
  id: string,
  parent: string,
  author: string,
  body: string,
  replies?: Json,
): Json => ({
  kind: "t1",
  data: {
    id,
    author,
    body,
    parent_id: parent,
    score: 3,
    created_utc: 1_700_000_100,
    replies: replies ?? "",
  },
});

function childrenOf(top: string): readonly Json[] {
  return [
    comment("c1", top, "first", `${FACT} First.`),
    comment("c2", top, "[deleted]", "[deleted]", {
      kind: "Listing",
      data: { children: [comment("c3", "t1_c2", "third", `${FACT} Third.`)] },
    }),
    comment("c4", top, "AutoModerator", "Remember the rules of the community."),
    comment("c5", top, "fifth", "lol"),
    comment("c6", top, "sixth", `${FACT} Sixth.`),
  ];
}

export function threadOf(
  id: string,
  post: Readonly<Record<string, Json>> = {},
  children: readonly Json[] = childrenOf(`t3_${id}`),
): string {
  return JSON.stringify([
    {
      kind: "Listing",
      data: {
        children: [
          {
            kind: "t3",
            data: {
              id,
              title: `Post ${id}`,
              author: "poster",
              subreddit: "links",
              selftext: "",
              created_utc: 1_700_000_000,
              num_comments: 6,
              is_self: false,
              url: TARGET,
              ...post,
            },
          },
        ],
      },
    },
    { kind: "Listing", data: { children } },
  ]);
}

export const addressOf = (id: string) => `https://www.reddit.com/r/links/comments/${id}/a_post/`;

export function readerOf(current: () => Instance) {
  const paste = async (id: string, extra: Readonly<Record<string, Json>>) => {
    const { item } = await current().read("POST", "/api/items", SavedItemResponseSchema, {
      url: addressOf(id),
      ...extra,
    });

    return item.id;
  };

  const listed = async (id: number) =>
    (await current().read("GET", "/api/items", ItemReadResponseSchema)).items.find(
      (item) => item.id === id,
    );

  const nodes = async (id: number) =>
    (await current().detail(id)).comments.nodes.map(({ kind, id: node }) => `${kind}:${node}`);

  const view = async (id: number) => (await current().detail(id)).comments.view;

  return { paste, listed, nodes, view };
}

export function causeOf(view: CommentsView["view"]) {
  return view?.filter === "unfiltered" ? view.cause : null;
}
