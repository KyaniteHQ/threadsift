import { X_QUOTES_MAX } from "../../../core/contract/limits.ts";
import { onlyXImages } from "../../../core/contract/x-images.ts";
import type { XCliReply, XCliThreadValue, XQuoted } from "../../../core/contract/x-wire.ts";
import type { PlanFacts, SearchStep } from "./x-api-plan.ts";
import {
  type ApiPost,
  type Includes,
  type Lookup,
  type SearchPage,
  postedAtOf,
  referenced,
  shownText,
} from "./x-api-posts.ts";

const HANDLE = /^[A-Za-z0-9_]+$/u;

export interface SearchRead {
  readonly step: SearchStep;
  readonly minLikes: number | null;
  readonly page: SearchPage;
}

export interface XApiReads {
  readonly statusId: string;
  readonly root: Lookup | null;
  readonly quotesAsked: readonly string[];
  readonly quoteLookups: readonly Lookup[];
  readonly searches: readonly SearchRead[];
}

interface Known {
  readonly posts: Readonly<ReadonlyMap<string, ApiPost>>;
  readonly handles: Readonly<ReadonlyMap<string, string>>;
  readonly photos: Readonly<ReadonlyMap<string, string>>;
}

function lookupsOf(reads: Readonly<XApiReads>): readonly Lookup[] {
  return reads.root === null ? reads.quoteLookups : [reads.root, ...reads.quoteLookups];
}

function knownOf(reads: Readonly<XApiReads>): Known {
  const lookups = lookupsOf(reads);
  const includes: readonly Includes[] = [
    ...lookups.map((answer) => answer.includes),
    ...reads.searches.map(({ page }) => page.includes),
  ];
  const posts = lookups.flatMap(({ data, includes: { tweets } }) =>
    data === undefined ? tweets : [data].concat(tweets),
  );

  return {
    posts: new Map(posts.map((post) => [post.id, post])),
    handles: new Map(
      includes.flatMap(({ users }) => users).map(({ id, username }) => [id, username]),
    ),
    photos: new Map(
      includes
        .flatMap(({ media }) => media)
        .flatMap(({ media_key: key, type, url }) =>
          type === "photo" && url !== undefined ? [[key, url] as const] : [],
        ),
    ),
  };
}

function photosOf(post: ApiPost, known: Readonly<Known>): string[] {
  return onlyXImages(
    (post.attachments?.media_keys ?? []).flatMap((key) => {
      const url = known.photos.get(key);

      return url === undefined ? [] : [url];
    }),
  );
}

function handleOf(authorId: string, known: Readonly<Known>): string | null {
  const handle = known.handles.get(authorId);

  return handle !== undefined && HANDLE.test(handle) ? handle : null;
}

interface Quoted {
  readonly post: ApiPost;
  readonly author: string;
}

function chainOf(root: ApiPost, known: Readonly<Known>): readonly Quoted[] {
  const chain: Quoted[] = [];
  let next = referenced(root, "quoted");

  while (next !== null && chain.length < X_QUOTES_MAX) {
    const post = known.posts.get(next);
    const author = post === undefined ? null : handleOf(post.author_id, known);

    if (post === undefined || author === null) break;

    chain.push({ post, author });
    next = referenced(post, "quoted");
  }

  return chain;
}

function quotedOf(
  { post, author }: Readonly<Quoted>,
  quoteShown: boolean,
  known: Readonly<Known>,
): XQuoted {
  return {
    id: post.id,
    author,
    text: shownText(post, quoteShown),
    postedAt: postedAtOf(post),
    images: photosOf(post, known),
  };
}

interface Candidate {
  readonly post: ApiPost;
  readonly author: string;
  readonly parentId: string;
}

function candidatesOf(
  reads: Readonly<XApiReads>,
  root: ApiPost,
  rootAuthor: string,
  known: Readonly<Known>,
): readonly Candidate[] {
  const left = new Set([root.id, ...chainOf(root, known).map(({ post }) => post.id)]);
  const found = new Map<string, Candidate>();

  for (const { step, page } of reads.searches) {
    for (const post of page.data) {
      const parentId = referenced(post, "replied_to");
      const author = step === "author" ? rootAuthor : handleOf(post.author_id, known);

      if (!left.has(post.id) && !found.has(post.id) && parentId !== null && author !== null) {
        found.set(post.id, { post, author, parentId });
      }
    }
  }

  return [...found.values()];
}

function replyOf(
  { post, author, parentId }: Readonly<Candidate>,
  known: Readonly<Known>,
): XCliReply {
  return {
    id: post.id,
    parentId,
    author,
    text: shownText(post, false),
    postedAt: postedAtOf(post),
    likes: post.public_metrics?.like_count ?? null,
    replies: post.public_metrics?.reply_count ?? null,
    images: photosOf(post, known),
  };
}

export function threadOf(reads: Readonly<XApiReads>): XCliThreadValue | null {
  const root = reads.root?.data;
  const known = knownOf(reads);
  const author = root === undefined ? null : handleOf(root.author_id, known);

  if (root === undefined || author === null) return null;

  const candidates = candidatesOf(reads, root, author, known);

  const chain = chainOf(root, known);

  return {
    post: {
      id: root.id,
      author,
      text: shownText(root, chain.length > 0),
      postedAt: postedAtOf(root),
      replies: root.public_metrics?.reply_count ?? null,
      images: photosOf(root, known),
      quoted: chain.map((quoted, at) => quotedOf(quoted, at + 1 < chain.length, known)),
    },
    replies: candidates.map((candidate) => replyOf(candidate, known)),
  };
}

function quoteToExpand(
  reads: Readonly<XApiReads>,
  root: ApiPost,
  known: Readonly<Known>,
): string | null {
  const chain = chainOf(root, known);
  const last = chain.at(-1)?.post;

  if (last === undefined || chain.length >= X_QUOTES_MAX) return null;

  const next = referenced(last, "quoted");
  const looked = reads.quotesAsked.includes(last.id);

  return next === null || known.posts.has(next) || looked ? null : last.id;
}

export function factsOf(reads: Readonly<XApiReads>): PlanFacts {
  const root = reads.root?.data;
  const thread = threadOf(reads);

  return {
    statusId: reads.statusId,
    root:
      root === undefined || thread === null
        ? null
        : {
            conversationId: root.conversation_id ?? root.id,
            author: thread.post.author,
            replyCount: root.public_metrics?.reply_count ?? 0,
            postedAt: thread.post.postedAt,
          },
    quoteToExpand: root === undefined ? null : quoteToExpand(reads, root, knownOf(reads)),
    quoteLookups: reads.quoteLookups.length,
    searches: reads.searches.map(({ step, minLikes, page }) => ({
      step,
      minLikes,
      nextToken: page.meta.next_token ?? null,
    })),
    replies: thread?.replies.length ?? 0,
  };
}
