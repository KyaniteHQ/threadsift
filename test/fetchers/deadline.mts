import type { Fetcher } from "../../src/core/kernel/fetcher.ts";
import { hostOf, words } from "./words.mts";

export const calls: string[] = [];

export const asked: string[] = [];

const pending: string[] = [];

export const activity = new EventTarget();

function afterAbort<Answer>(
  signal: AbortSignal,
  settle: (resolve: (answer: Answer) => void, reject: (error: Error) => void) => void,
): Promise<Answer> {
  return new Promise((resolve, reject) => {
    signal.addEventListener(
      "abort",
      () => {
        queueMicrotask(() => {
          settle(resolve, reject);
        });
      },
      { once: true },
    );
  });
}

export default {
  matches: (url) => {
    asked.push(url);

    return hostOf(url) === "deadline.test";
  },
  fetch: (url, { signal }) => {
    const { pathname } = new URL(url);

    calls.push(pathname);
    activity.dispatchEvent(new Event(pathname));

    if (pathname === "/never") {
      return new Promise<never>(() => {
        pending.push(pathname);
      });
    }

    if (pathname === "/abort-error") {
      return Promise.reject(new DOMException("stopped by the plug-in", "AbortError"));
    }

    return afterAbort(signal, (resolve, reject) => {
      if (pathname === "/late-reject") {
        reject(new Error("DEADLINEMESSAGE a late rejection"));
      } else {
        resolve({ markdown: words("LATEMARKER"), title: "Answered after the deadline" });
      }
      activity.dispatchEvent(new Event(`settled${pathname}`));
    });
  },
} satisfies Fetcher;
