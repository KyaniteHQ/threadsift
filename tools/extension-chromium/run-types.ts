import type { Session } from "./browser.ts";
import type { Instance } from "./instance.ts";
import type { StandIn } from "./stand-in.ts";

export interface Run {
  readonly session: Session;
  readonly instance: Instance;
  readonly standIn: StandIn;
  readonly redditSession: string;
}

export function threadUrl(postId: string): string {
  return `https://www.reddit.com/r/synthetic/comments/${postId}/synthetic_thread/`;
}
