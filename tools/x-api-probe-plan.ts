import { ASSUMED, type Counts, NO_COUNTS, REFERENCE_TYPES, totalOf } from "./x-api-probe-cost.ts";

export class Refusal extends Error {}

export const PROBES = ["S1", "S2", "S3", "S4", "S5", "S6", "S7"] as const;
export type ProbeName = (typeof PROBES)[number];

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

type Expansion =
  | "author_id"
  | "referenced_tweets.id"
  | "referenced_tweets.id.author_id"
  | "referenced_posts"
  | "attachments.media_keys"
  | "username";

const WORST_PER_POST: Record<
  Expansion,
  { readonly includedPosts: number; readonly users: number }
> = {
  author_id: { includedPosts: 0, users: 1 },
  "referenced_tweets.id": { includedPosts: REFERENCE_TYPES, users: 0 },
  "referenced_tweets.id.author_id": { includedPosts: 0, users: REFERENCE_TYPES },
  referenced_posts: { includedPosts: REFERENCE_TYPES, users: 0 },
  "attachments.media_keys": { includedPosts: 0, users: 0 },
  username: { includedPosts: 0, users: ASSUMED.usernameUsersPerPost },
};

export type RequestRole =
  | "opening-balance"
  | "mid-balance"
  | "closing-balance"
  | "usage"
  | "lookup";

export type PlannedRequest = {
  readonly label: string;
  readonly role: RequestRole;
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  readonly worst: Counts;
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

function balanceRead(
  label: string,
  role: "opening-balance" | "mid-balance" | "closing-balance",
): PlannedRequest {
  return {
    label,
    role,
    path: "/2/usage/credits",
    query: {},
    worst: { ...NO_COUNTS, usageReads: 1 },
    settleFirst: role !== "opening-balance",
  };
}

function usageRead(): PlannedRequest {
  return {
    label: "usage-tweets",
    role: "usage",
    path: "/2/usage/tweets",
    query: { days: "1", "usage.fields": "daily_client_app_usage" },
    worst: { ...NO_COUNTS, usageReads: 1 },
    settleFirst: false,
  };
}

function lookupRead(label: string, ids: readonly string[], fields: LookupFields): PlannedRequest {
  const [only] = ids;
  const single = ids.length === 1 && only !== undefined;
  const perPost = fields.expansions.reduce(
    (sum, expansion) => ({
      includedPosts: sum.includedPosts + WORST_PER_POST[expansion].includedPosts,
      users: sum.users + WORST_PER_POST[expansion].users,
    }),
    { includedPosts: 0, users: 0 },
  );
  const query: (readonly [string, string])[] = [];

  if (!single) query.push(["ids", ids.join(",")]);
  if (fields.postFields !== undefined)
    query.push([fields.postFields.param, fields.postFields.values]);
  if (fields.expansions.length > 0) query.push(["expansions", fields.expansions.join(",")]);
  if (fields.detailFields) query.push(["user.fields", USER_FIELDS], ["media.fields", MEDIA_FIELDS]);

  return {
    label,
    role: "lookup",
    path: single ? `/2/tweets/${only}` : "/2/tweets",
    query: Object.fromEntries(query),
    worst: {
      ...NO_COUNTS,
      posts: ids.length,
      includedPosts: ids.length * perPost.includedPosts,
      users: ids.length * perPost.users,
    },
    settleFirst: false,
  };
}

function probeSteps(input: ProbeInput): readonly PlannedRequest[] {
  switch (input.probe) {
    case "S1":
      return [
        usageRead(),
        balanceRead("balance-after-usage-reads", "mid-balance"),
        lookupRead("lookup-tweet-names", [input.postId], S1_LOOKUPS.tweet),
        lookupRead("lookup-post-names", [input.postId], S1_LOOKUPS.post),
      ];
    case "S2":
      return [
        lookupRead("lookup-plain", [input.plainId], PLAIN),
        balanceRead("balance-after-plain", "mid-balance"),
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
    balanceRead("balance-before", "opening-balance"),
    ...probeSteps(input),
    balanceRead("balance-after", "closing-balance"),
  ];
}

export function isBalanceRead(request: PlannedRequest): boolean {
  return request.role !== "usage" && request.role !== "lookup";
}

function isServerError(status: number): boolean {
  return status >= 500 && status <= 599;
}

export function endsRunOn(request: PlannedRequest, status: number): boolean {
  return (
    status === 401 ||
    status === 429 ||
    status > 599 ||
    (isServerError(status) && request.role !== "usage")
  );
}

const USAGE_UNANSWERED =
  "does not show whether a usage read costs anything, and its balance-lag check rests on the lookups alone";

export function usageFailureRuleOf(
  probe: ProbeName,
  plan: readonly PlannedRequest[],
): string | undefined {
  const labels = plan.flatMap((request) => (request.role === "usage" ? [request.label] : []));

  return labels.length === 0
    ? undefined
    : `An answer to ${labels.join(", ")} with a status below 600 other than 200, 401 and 429 is saved, stays charged at its worst case, and the run goes on; such a run of ${probe} ${USAGE_UNANSWERED}.`;
}

export function usageQuestionOf(request: PlannedRequest, status: number): string | undefined {
  return request.role === "usage" && status !== 200 && !endsRunOn(request, status)
    ? `unanswered: the usage read failed with ${status}, so this run ${USAGE_UNANSWERED}`
    : undefined;
}

export const BALANCE_SETTLE_MS = 60_000;

export const PLAN_FILE = "plan.json";
export const SUMMARY_FILE = "summary.json";

export function recordNameOf(index: number, request: PlannedRequest): string {
  return `${String(index + 1).padStart(2, "0")}-${request.label}.json`;
}

export function runFilesOf(plan: readonly PlannedRequest[]): readonly string[] {
  return [PLAN_FILE, ...plan.map((request, index) => recordNameOf(index, request)), SUMMARY_FILE];
}

export function worstOf(plan: readonly PlannedRequest[]): Counts {
  return totalOf(plan.map((request) => request.worst));
}
