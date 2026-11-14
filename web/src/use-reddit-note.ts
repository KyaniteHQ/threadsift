import { useEffect, useState } from "react";

import { redditRefOf } from "../../src/core/links.ts";
import type { RedditAccountView } from "../../src/core/reddit-account-contract.ts";
import { fetchRedditAccount } from "./reddit-account-api.ts";
import { fetchRedditSettings } from "./reddit-api.ts";

export type RedditNote =
  | { readonly state: "unknown" }
  | { readonly state: RedditAccountView["state"]; readonly archiveFill: boolean };

const UNKNOWN: RedditNote = { state: "unknown" };

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
  const [note, setNote] = useState<RedditNote>(UNKNOWN);

  useEffect(() => {
    const controller = new AbortController();

    const read = async (): Promise<void> => {
      try {
        const [{ state }, { archiveFill }] = await Promise.all([
          fetchRedditAccount(controller.signal),
          fetchRedditSettings(controller.signal),
        ]);

        setNote({ state, archiveFill });
      } catch {
        setNote(UNKNOWN);
      }
    };

    void read();

    return () => {
      controller.abort();
    };
  }, []);

  return note;
}
