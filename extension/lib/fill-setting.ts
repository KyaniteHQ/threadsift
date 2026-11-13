import { browser } from "wxt/browser";

import { REDDIT_HOSTS } from "./config.ts";
import { hasRedditAccess } from "./fill-script.ts";

export type FillState =
  | { readonly kind: "loading" }
  | { readonly kind: "unreadable" }
  | { readonly kind: "idle" | "working" | "failed"; readonly on: boolean }
  | { readonly kind: "denied"; readonly on: false };

async function readAccess(kind: "idle" | "failed"): Promise<FillState> {
  try {
    return { kind, on: await hasRedditAccess() };
  } catch {
    return { kind: "unreadable" };
  }
}

export function loadFill(): Promise<FillState> {
  return readAccess("idle");
}

export async function turnFill(on: boolean): Promise<FillState> {
  try {
    if (on) await browser.permissions.remove({ origins: REDDIT_HOSTS });
    else if (!(await browser.permissions.request({ origins: REDDIT_HOSTS }))) {
      return { kind: "denied", on: false };
    }
  } catch {
    return readAccess("failed");
  }

  return readAccess("idle");
}
