import type { LinkRoute } from "../../../core/contract/links.ts";
import type { ClaimedJob } from "../../../core/kernel/job-outcome.ts";
import { isLastAttempt } from "../../../core/kernel/job-retry.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import type { Concluded, Fetched } from "../../media/core/details.ts";
import { type ArchivedThread, archivedThread } from "./archive-fill.ts";
import { fetchedOfOembed } from "./oembed-details.ts";
import { accountThread } from "./reddit-account-fetch.ts";
import { REDDIT_WAIT } from "./reddit-account-queue.ts";
import { accountTurn } from "./reddit-account-turn.ts";

type RedditPorts = Pick<
  Ports,
  "db" | "secrets" | "network" | "pages" | "jobs" | "redditSession" | "fetchers"
>;

type RedditRoute = Extract<LinkRoute, { readonly kind: "reddit" }>;

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

export async function fetchedWithThread(
  ports: RedditPorts,
  source: Readonly<ClaimedJob>,
  { link, ref }: Readonly<RedditRoute>,
  deadline: AbortSignal,
): Promise<Fetched> {
  const turn = await accountTurn(ports, source);

  if (turn.kind === "waiting") {
    return { status: "waiting", until: turn.until, limited: false, wait: REDDIT_WAIT };
  }

  const account =
    turn.kind === "held"
      ? await accountThread(ports, turn.held, ref, {
          lastAttempt: isLastAttempt(source.attempts),
          deadline,
        })
      : null;

  if (account?.kind === "waiting") {
    return {
      status: "waiting",
      until: account.until,
      limited: account.limited,
      wait: REDDIT_WAIT,
    };
  }

  const [fetched, served] = await Promise.all([
    fetchedOfOembed(ports.network, link.normalizedUrl, deadline),
    account?.kind === "thread"
      ? { thread: account.thread, archivedAt: null }
      : archivedThread(ports, source.itemId, ref, deadline),
  ]);

  return served === null ? fetched : threadFilled(fetched, served);
}
