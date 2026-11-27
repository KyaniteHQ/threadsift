import { X_QUOTES_MAX, X_REPLIES_KEPT_MAX } from "../../../core/contract/limits.ts";
import { postsMicros } from "../../../core/contract/x-api-contract.ts";

const POST_FIELDS =
  "created_at,author_id,conversation_id,referenced_tweets,note_tweet,public_metrics,attachments,entities";

const LOOKUP_QUERY = {
  "tweet.fields": POST_FIELDS,
  expansions:
    "author_id,referenced_tweets.id,referenced_tweets.id.author_id,attachments.media_keys",
  "user.fields": "username",
  "media.fields": "type,url",
};

const AUTHOR_QUERY = {
  "tweet.fields": POST_FIELDS,
  expansions: "attachments.media_keys",
  "media.fields": "type,url",
};

const REPLIES_QUERY = {
  "tweet.fields": POST_FIELDS,
  expansions: "author_id,attachments.media_keys",
  "user.fields": "username",
  "media.fields": "type,url",
};

const LOOKUP_WORST = { posts: 3, users: 3 } as const;

const QUOTE_LOOKUPS_MAX = X_QUOTES_MAX - 1;

const PAGE_MAX = 100;

const PAGE_MIN = 10;

const SMALL_CONVERSATION = 100;

const SMALL_PAGES_MAX = 2;

const LIKES_LADDER = [100, 10, 1] as const;

export type SearchStep = "author" | "replies";

export interface SearchDone {
  readonly step: SearchStep;
  readonly minLikes: number | null;
  readonly nextToken: string | null;
}

export interface PlanFacts {
  readonly statusId: string;
  readonly root: {
    readonly conversationId: string;
    readonly author: string;
    readonly replyCount: number;
  } | null;
  readonly quoteToExpand: string | null;
  readonly quoteLookups: number;
  readonly searches: readonly SearchDone[];
  readonly replies: number;
}

export interface Resources {
  readonly posts: number;
  readonly users: number;
}

export interface XApiRequest {
  readonly step: "root" | "quote" | SearchStep;
  readonly path: string;
  readonly worst: Resources;
  readonly search: boolean;
  readonly minLikes: number | null;
}

export type NextStep =
  | { readonly kind: "request"; readonly request: XApiRequest }
  | { readonly kind: "done" }
  | { readonly kind: "over-limit" };

const DONE: NextStep = { kind: "done" };

const OVER_LIMIT: NextStep = { kind: "over-limit" };

export function microsOf({ posts, users }: Readonly<Resources>): number {
  return postsMicros(posts, users);
}

function pathOf(path: string, query: Readonly<Record<string, string>>): string {
  return `${path}?${new URLSearchParams(query).toString()}`;
}

function lookup(step: "root" | "quote", id: string, left: number): NextStep {
  if (microsOf(LOOKUP_WORST) > left) return OVER_LIMIT;

  return {
    kind: "request",
    request: {
      step,
      path: pathOf(`/2/tweets/${id}`, LOOKUP_QUERY),
      worst: LOOKUP_WORST,
      search: false,
      minLikes: null,
    },
  };
}

interface Search {
  readonly step: SearchStep;
  readonly query: string;
  readonly minLikes: number | null;
  readonly token: string | null;
}

function search({ step, query, minLikes, token }: Readonly<Search>, left: number): NextStep {
  const usersPerPost = step === "author" ? 0 : 1;
  const size = Math.min(PAGE_MAX, Math.floor(left / microsOf({ posts: 1, users: usersPerPost })));

  if (size < PAGE_MIN) return OVER_LIMIT;

  const fields = step === "author" ? AUTHOR_QUERY : REPLIES_QUERY;
  const paging = token === null ? {} : { pagination_token: token };

  return {
    kind: "request",
    request: {
      step,
      path: pathOf("/2/tweets/search/all", {
        query,
        max_results: String(size),
        ...fields,
        ...paging,
      }),
      worst: { posts: size, users: size * usersPerPost },
      search: true,
      minLikes,
    },
  };
}

type Root = NonNullable<PlanFacts["root"]>;

function smallConversation(facts: Readonly<PlanFacts>, root: Root, left: number): NextStep {
  const pages = facts.searches.filter(({ step }) => step === "replies");
  const last = pages.at(-1);
  const query = `conversation_id:${root.conversationId}`;

  if (last === undefined)
    return search({ step: "replies", query, minLikes: null, token: null }, left);

  if (last.nextToken === null || pages.length >= SMALL_PAGES_MAX) return DONE;

  return facts.replies >= X_REPLIES_KEPT_MAX
    ? DONE
    : search({ step: "replies", query, minLikes: null, token: last.nextToken }, left);
}

function largeConversation(facts: Readonly<PlanFacts>, root: Root, left: number): NextStep {
  const conversation = `conversation_id:${root.conversationId}`;

  if (!facts.searches.some(({ step }) => step === "author")) {
    return search(
      { step: "author", query: `${conversation} from:${root.author}`, minLikes: null, token: null },
      left,
    );
  }

  if (facts.replies >= X_REPLIES_KEPT_MAX) return DONE;

  const asked = new Set(facts.searches.map(({ minLikes }) => minLikes));
  const minLikes = LIKES_LADDER.find((likes) => !asked.has(likes));

  return minLikes === undefined
    ? DONE
    : search(
        {
          step: "replies",
          query: `${conversation} -from:${root.author} min_likes:${String(minLikes)}`,
          minLikes,
          token: null,
        },
        left,
      );
}

export function nextRequest(facts: Readonly<PlanFacts>, left: number): NextStep {
  const { root } = facts;

  if (root === null) return lookup("root", facts.statusId, left);

  if (facts.quoteToExpand !== null && facts.quoteLookups < QUOTE_LOOKUPS_MAX) {
    return lookup("quote", facts.quoteToExpand, left);
  }

  if (root.replyCount === 0) return DONE;

  return root.replyCount <= SMALL_CONVERSATION
    ? smallConversation(facts, root, left)
    : largeConversation(facts, root, left);
}
