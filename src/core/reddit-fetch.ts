import { type ArchivedThread, archivedThread } from "./archive-fill.ts";
import type { Concluded, Fetched } from "./details.ts";
import type { ClaimedJob } from "./job-outcome.ts";
import { isLastAttempt } from "./job-retry.ts";
import type { LinkRoute, RedditRef } from "./links.ts";
import { fetchedOfOembed } from "./oembed-details.ts";
import type { Ports } from "./ports.ts";
import { accountThread } from "./reddit-account-fetch.ts";
import { type AccountTurn, accountTurn } from "./reddit-account-turn.ts";

type RedditPorts = Pick<
  Ports,
  "db" | "secrets" | "network" | "pages" | "jobs" | "redditSession" | "fetchers"
>;

type RedditRoute = Extract<LinkRoute, { readonly kind: "reddit" }>;

type ServedThread =
  | ({ readonly kind: "thread" } & ArchivedThread)
  | Extract<Awaited<ReturnType<typeof accountThread>>, { readonly kind: "waiting" }>;

function threadFilled(
  oembed: Readonly<Concluded>,
  { thread, archivedAt }: Readonly<ArchivedThread>,
): Concluded {
  const known = oembed.status === "ok" ? oembed.found : null;

  return {
    status: "ok",
    found: {
      title: known?.title ?? thread.title,
      author: known?.author ?? thread.author,
      community: known?.community ?? thread.community,
      content: { kind: "thread", thread, archivedAt },
    },
  };
}

async function servedThread(
  ports: RedditPorts,
  { attempts, itemId }: Readonly<ClaimedJob>,
  ref: Readonly<RedditRef>,
  turn: Readonly<AccountTurn>,
  deadline: AbortSignal,
): Promise<ServedThread | null> {
  if (turn.kind === "held") {
    const account = await accountThread(ports, turn.held, ref, {
      lastAttempt: isLastAttempt(attempts),
      deadline,
    });

    if (account.kind === "thread") {
      return { kind: "thread", thread: account.thread, archivedAt: null };
    }

    if (account.kind === "waiting") return account;
  }

  const archived = await archivedThread(ports, itemId, ref, deadline);

  return archived === null ? null : { kind: "thread", ...archived };
}

export async function fetchedWithThread(
  ports: RedditPorts,
  source: Readonly<ClaimedJob>,
  { link, ref }: Readonly<RedditRoute>,
  deadline: AbortSignal,
): Promise<Fetched> {
  const turn = await accountTurn(ports, source);

  if (turn.kind === "waiting") {
    return { status: "waiting", until: turn.until, limited: false, wait: "reddit-limit" };
  }

  const [fetched, served] = await Promise.all([
    fetchedOfOembed(ports.network, link.normalizedUrl, deadline),
    servedThread(ports, source, ref, turn, deadline),
  ]);

  if (served?.kind === "waiting") {
    return {
      status: "waiting",
      until: served.until,
      limited: served.limited,
      wait: "reddit-limit",
    };
  }

  return served === null ? fetched : threadFilled(fetched, served);
}
