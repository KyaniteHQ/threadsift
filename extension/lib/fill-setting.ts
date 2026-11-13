import { browser } from "wxt/browser";

import { REDDIT_HOSTS } from "./config.ts";
import { logFailure } from "./log.ts";
import { readStored, requestChange } from "./settings.ts";

export type FillState =
  | { readonly kind: "loading" }
  | { readonly kind: "unreadable" }
  | { readonly kind: "idle" | "working" | "failed"; readonly on: boolean }
  | { readonly kind: "denied"; readonly on: false };

async function readFill(kind: "idle" | "failed"): Promise<FillState> {
  const stored = await readStored();

  return stored === null ? { kind: "unreadable" } : { kind, on: stored.fill };
}

export function loadFill(): Promise<FillState> {
  return readFill("idle");
}

async function requestAccess(): Promise<boolean | null> {
  try {
    return await browser.permissions.request({ origins: REDDIT_HOSTS });
  } catch (cause) {
    logFailure("fill-request-failed", cause);

    return null;
  }
}

export async function turnFill(turnOn: boolean): Promise<FillState> {
  if (turnOn) {
    const granted = await requestAccess();

    if (granted === null) return readFill("failed");

    if (!granted) return { kind: "denied", on: false };
  }

  const answer = await requestChange({ kind: "fill", on: turnOn });

  if (answer === null) return { kind: "unreadable" };

  const settled = answer.write === "done" && answer.access === "reconciled";

  return {
    kind: settled && answer.stored.fill === turnOn ? "idle" : "failed",
    on: answer.stored.fill,
  };
}
