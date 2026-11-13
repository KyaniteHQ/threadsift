import type { ComponentType, ReactNode } from "react";

import { ModuleBoundary, lazyModule } from "./ModuleBoundary.tsx";
import { IMPORT_PATH, LOG_PATH, PROPOSALS_PATH, SETTINGS_PATH } from "./routing.ts";
import { Unreachable } from "./Unreachable.tsx";

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
  if (isLazyPath(path)) LOADERS[path]().catch(() => {});
}

function unreachable(retry: () => void): ReactNode {
  return <Unreachable retry={retry} />;
}

function page<Props extends object>(load: () => Promise<ComponentType<Props>>) {
  const Page = lazyModule(load);

  return function LazyPage(props: Readonly<Props>) {
    return (
      <ModuleBoundary fallback={unreachable}>
        <Page {...props} />
      </ModuleBoundary>
    );
  };
}

export const SettingsPage = page(LOADERS[SETTINGS_PATH]);

export const ImportPage = page(LOADERS[IMPORT_PATH]);

export const LogPage = page(LOADERS[LOG_PATH]);

export const ProposalsPage = page(LOADERS[PROPOSALS_PATH]);
