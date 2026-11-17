import { type ComponentType, lazy } from "react";

import { NOTHING } from "../../src/core/nothing.ts";
import { unavailable } from "./module-unavailable.ts";
import { IMPORT_PATH, LOG_PATH, PROPOSALS_PATH, SETTINGS_PATH } from "./routing.ts";

const LOADERS = {
  [SETTINGS_PATH]: () => import("./SettingsPage.tsx").then((m) => m.SettingsPage),
  [IMPORT_PATH]: () => import("./ImportPage.tsx").then((m) => m.ImportPage),
  [LOG_PATH]: () => import("./LogPage.tsx").then((m) => m.LogPage),
  [PROPOSALS_PATH]: () => import("./ProposalsPage.tsx").then((m) => m.ProposalsPage),
};

type LazyPath = keyof typeof LOADERS;

function isLazyPath(path: string): path is LazyPath {
  return Object.hasOwn(LOADERS, path);
}

export function preloadPage(path: string): void {
  if (isLazyPath(path)) LOADERS[path]().catch(NOTHING);
}

function page<Props extends object>(load: () => Promise<ComponentType<Props>>) {
  return lazy(() => load().then((component) => ({ default: component }), unavailable));
}

export const SettingsPage = page(LOADERS[SETTINGS_PATH]);

export const ImportPage = page(LOADERS[IMPORT_PATH]);

export const LogPage = page(LOADERS[LOG_PATH]);

export const ProposalsPage = page(LOADERS[PROPOSALS_PATH]);
