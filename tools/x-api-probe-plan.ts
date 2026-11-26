export const PROBES = ["S1", "S2", "S3", "S4", "S5", "S6", "S7"] as const;
export type ProbeName = (typeof PROBES)[number];

export const LATER_PROBES = {
  S4: "6.5",
  S5: "6.5",
  S6: "6.8",
  S7: "6.7",
} as const satisfies Partial<Record<ProbeName, string>>;

export const FIELD_NAMES = ["tweet", "post"] as const;
export type FieldNames = (typeof FIELD_NAMES)[number];

export type ProbeInput =
  | { readonly probe: "S1"; readonly postId: string }
  | {
      readonly probe: "S2";
      readonly plainId: string;
      readonly expandedId: string;
      readonly names: FieldNames;
    }
  | {
      readonly probe: "S3";
      readonly deletedId: string;
      readonly protectedId: string;
      readonly suspendedId: string;
    };

export const POST_ID_COUNT = { S1: 1, S2: 2, S3: 3 } as const satisfies Record<
  ProbeInput["probe"],
  number
>;

export const MICROS_PER_USD = 1_000_000;

export const PRICE_MICROS = {
  post: 5_000,
  user: 10_000,
  usageRead: 10_000,
} as const;

export const BALANCE_SETTLE_MS = 60_000;

export const CEILING = { usdMicros: 2 * MICROS_PER_USD, posts: 400 } as const;

export type Caps = { readonly usdMicros: number; readonly posts: number };

export type Resources = {
  readonly posts: number;
  readonly users: number;
  readonly usageReads: number;
};

const NO_RESOURCES: Resources = { posts: 0, users: 0, usageReads: 0 };

type Expansion =
  | "author_id"
  | "referenced_tweets.id"
  | "referenced_tweets.id.author_id"
  | "referenced_posts"
  | "attachments.media_keys"
  | "username";

const REFERENCE_TYPES = 3;

const WORST_PER_POST: Record<Expansion, { readonly posts: number; readonly users: number }> = {
  author_id: { posts: 0, users: 1 },
  "referenced_tweets.id": { posts: REFERENCE_TYPES, users: 0 },
  "referenced_tweets.id.author_id": { posts: 0, users: REFERENCE_TYPES },
  referenced_posts: { posts: REFERENCE_TYPES, users: 0 },
  "attachments.media_keys": { posts: 0, users: 0 },
  username: { posts: 0, users: 1 },
};

export type RequestKind = "balance" | "usage" | "lookup";

export type PlannedRequest = {
  readonly label: string;
  readonly kind: RequestKind;
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  readonly worst: Resources;
  readonly settleFirst: boolean;
};

type LookupFields = {
  readonly postFields?: { readonly param: "tweet.fields" | "post.fields"; readonly values: string };
  readonly expansions: readonly Expansion[];
  readonly detailFields: boolean;
};

const USER_FIELDS = "username,name,profile_image_url,verified,protected";
const MEDIA_FIELDS = "type,url,variants,preview_image_url,alt_text,width,height";

const S1_LOOKUPS: Record<FieldNames, LookupFields> = {
  tweet: {
    postFields: {
      param: "tweet.fields",
      values:
        "created_at,author_id,conversation_id,in_reply_to_user_id,referenced_tweets,note_tweet,public_metrics,attachments,entities,edit_history_tweet_ids,withheld,possibly_sensitive,lang",
    },
    expansions: [
      "author_id",
      "referenced_tweets.id",
      "referenced_tweets.id.author_id",
      "attachments.media_keys",
    ],
    detailFields: true,
  },
  post: {
    postFields: {
      param: "post.fields",
      values:
        "created_at,conversation_id,note_post,public_metrics,attachments,entities,withheld,possibly_sensitive,lang",
    },
    expansions: ["author_id", "referenced_posts", "attachments.media_keys", "username"],
    detailFields: true,
  },
};

const S2_EXPANSIONS: Record<FieldNames, readonly Expansion[]> = {
  tweet: ["author_id", "referenced_tweets.id", "referenced_tweets.id.author_id"],
  post: ["author_id", "referenced_posts"],
};

const PLAIN: LookupFields = { expansions: [], detailFields: false };

function balanceRead(label: string, settleFirst: boolean): PlannedRequest {
  return {
    label,
    kind: "balance",
    path: "/2/usage/credits",
    query: {},
    worst: { ...NO_RESOURCES, usageReads: 1 },
    settleFirst,
  };
}

function usageRead(): PlannedRequest {
  return {
    label: "usage-tweets",
    kind: "usage",
    path: "/2/usage/tweets",
    query: { days: "1", "usage.fields": "daily_client_app_usage" },
    worst: { ...NO_RESOURCES, usageReads: 1 },
    settleFirst: false,
  };
}

function lookupRead(label: string, ids: readonly string[], fields: LookupFields): PlannedRequest {
  const [only] = ids;
  const single = ids.length === 1 && only !== undefined;
  const perPost = fields.expansions.reduce(
    (sum, expansion) => ({
      posts: sum.posts + WORST_PER_POST[expansion].posts,
      users: sum.users + WORST_PER_POST[expansion].users,
    }),
    { posts: 1, users: 0 },
  );
  const query: (readonly [string, string])[] = [];

  if (!single) query.push(["ids", ids.join(",")]);
  if (fields.postFields !== undefined)
    query.push([fields.postFields.param, fields.postFields.values]);
  if (fields.expansions.length > 0) query.push(["expansions", fields.expansions.join(",")]);
  if (fields.detailFields) query.push(["user.fields", USER_FIELDS], ["media.fields", MEDIA_FIELDS]);

  return {
    label,
    kind: "lookup",
    path: single ? `/2/tweets/${only}` : "/2/tweets",
    query: Object.fromEntries(query),
    worst: {
      posts: ids.length * perPost.posts,
      users: ids.length * perPost.users,
      usageReads: 0,
    },
    settleFirst: false,
  };
}

function probeSteps(input: ProbeInput): readonly PlannedRequest[] {
  switch (input.probe) {
    case "S1":
      return [
        usageRead(),
        balanceRead("balance-after-usage-reads", true),
        lookupRead("lookup-tweet-names", [input.postId], S1_LOOKUPS.tweet),
        lookupRead("lookup-post-names", [input.postId], S1_LOOKUPS.post),
      ];
    case "S2":
      return [
        lookupRead("lookup-plain", [input.plainId], PLAIN),
        balanceRead("balance-after-plain", true),
        lookupRead("lookup-expanded", [input.expandedId], {
          expansions: S2_EXPANSIONS[input.names],
          detailFields: false,
        }),
      ];
    case "S3":
      return [
        lookupRead("lookup-deleted", [input.deletedId], PLAIN),
        lookupRead("lookup-protected", [input.protectedId], PLAIN),
        lookupRead("lookup-suspended", [input.suspendedId], PLAIN),
        lookupRead("lookup-batch", [input.deletedId, input.protectedId, input.suspendedId], PLAIN),
      ];
    default:
      return input satisfies never;
  }
}

export function planOf(input: ProbeInput): readonly PlannedRequest[] {
  return [
    balanceRead("balance-before", false),
    ...probeSteps(input),
    balanceRead("balance-after", true),
  ];
}

export function sumOf(all: readonly Resources[]): Resources {
  return all.reduce(
    (sum, next) => ({
      posts: sum.posts + next.posts,
      users: sum.users + next.users,
      usageReads: sum.usageReads + next.usageReads,
    }),
    NO_RESOURCES,
  );
}

export function worstOf(plan: readonly PlannedRequest[]): Resources {
  return sumOf(plan.map((request) => request.worst));
}

export function costOf(resources: Resources): number {
  return (
    resources.posts * PRICE_MICROS.post +
    resources.users * PRICE_MICROS.user +
    resources.usageReads * PRICE_MICROS.usageRead
  );
}

export function withinCaps(resources: Resources, caps: Caps): boolean {
  return costOf(resources) <= caps.usdMicros && resources.posts <= caps.posts;
}

export function usd(micros: number): string {
  return (micros / MICROS_PER_USD).toFixed(4);
}
