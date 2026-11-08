import { type RefObject, useCallback, useEffect, useState } from "react";

import type { GithubSettingsView } from "../../src/core/github-contract.ts";
import type { Token } from "../../src/http/schemas.ts";
import { fetchTokens } from "./access-api.ts";
import { type AiView, fetchAiSettings } from "./ai-api.ts";
import { fetchGithubSettings } from "./github-api.ts";
import { SECTION_FONTS, loadFonts } from "./load-fonts.ts";

export const SETTINGS_READ_MS = 20_000;

export type Loaded<View> =
  | { readonly kind: "failed" }
  | { readonly kind: "ready"; readonly view: View };

export interface SettingsLoad {
  readonly ai: Loaded<AiView>;
  readonly github: Loaded<GithubSettingsView>;
  readonly tokens: Loaded<readonly Token[]>;
}

async function settled<View>(
  load: (signal: AbortSignal) => Promise<View>,
  signal: AbortSignal,
): Promise<Loaded<View>> {
  try {
    return { kind: "ready", view: await load(signal) };
  } catch {
    return { kind: "failed" };
  }
}

export function useLoaded<View>(initial: Loaded<View>) {
  const [loaded, setLoaded] = useState(initial);

  const ready = useCallback((view: View) => {
    setLoaded({ kind: "ready", view });
  }, []);

  return { loaded, ready };
}

export function useSettingsLoad(page: RefObject<HTMLElement | null>): SettingsLoad | null {
  const [loaded, setLoaded] = useState<SettingsLoad | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;

    const deadline = window.setTimeout(() => {
      controller.abort();
    }, SETTINGS_READ_MS);

    const load = async (): Promise<void> => {
      const { signal } = controller;

      const [ai, github, tokens] = await Promise.all([
        settled(fetchAiSettings, signal),
        settled(fetchGithubSettings, signal),
        settled(fetchTokens, signal),
        page.current === null ? undefined : loadFonts(page.current, SECTION_FONTS, signal),
      ]);

      window.clearTimeout(deadline);

      if (mounted) setLoaded({ ai, github, tokens });
    };

    void load();

    return () => {
      mounted = false;
      window.clearTimeout(deadline);
      controller.abort();
    };
  }, [page]);

  return loaded;
}
