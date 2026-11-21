import { redditRefOf } from "../../src/core/contract/links.ts";
import type { RedditAccountView } from "../../src/core/contract/reddit-account-contract.ts";
import { fetchRedditAccount } from "./reddit-account-api.ts";
import { fetchRedditSettings } from "./reddit-api.ts";
import { useRead } from "./use-read.ts";

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

async function readNote(signal: AbortSignal): Promise<RedditNote> {
  const [{ state }, { archiveFill }] = await Promise.all([
    fetchRedditAccount(signal),
    fetchRedditSettings(signal),
  ]);

  return { state, archiveFill };
}

export function useRedditNote(): RedditNote {
  return useRead(readNote, UNKNOWN, UNKNOWN);
}
