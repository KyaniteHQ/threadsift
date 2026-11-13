import { useEffect, useState } from "react";

import { redditRefOf } from "../../src/core/links.ts";
import { fetchRedditAccount } from "./reddit-account-api.ts";

export type RedditNote = "none" | "connected" | "expired";

function isRedditLink(link: string): boolean {
  try {
    return redditRefOf(link) !== null;
  } catch {
    return false;
  }
}

export function redditLinkCount(links: readonly string[]): number {
  return links.filter((link) => isRedditLink(link)).length;
}

export function useRedditNote(): RedditNote {
  const [note, setNote] = useState<RedditNote>("none");

  useEffect(() => {
    const controller = new AbortController();

    const read = async (): Promise<void> => {
      try {
        const { state } = await fetchRedditAccount(controller.signal);

        setNote(state === "connected" || state === "expired" ? state : "none");
      } catch {
        setNote("none");
      }
    };

    void read();

    return () => {
      controller.abort();
    };
  }, []);

  return note;
}
