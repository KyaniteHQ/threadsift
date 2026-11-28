import { type Browser, browser } from "wxt/browser";

import { REDDIT_HOSTS } from "./config.ts";

interface Grant extends Browser.permissions.Permissions {
  readonly data_collection?: readonly string[];
}

export const FILL_DATA: Grant | null = import.meta.env.FIREFOX
  ? { data_collection: ["browsingActivity"] }
  : null;

export const FILL_PERMISSIONS: Grant = { ...FILL_DATA, origins: REDDIT_HOSTS };

export function holdsFillAccess(): Promise<boolean> {
  return browser.permissions.contains(FILL_PERMISSIONS);
}

interface Removed {
  readonly origins?: readonly string[];
  readonly data_collection?: readonly string[];
}

export function removalEndsFill({ origins, data_collection: data }: Removed): boolean {
  return (origins ?? []).length > 0 || (data ?? []).length > 0;
}
