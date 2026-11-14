import { type RefObject, useCallback, useEffect, useState } from "react";

import { fetchTokens } from "./access-api.ts";
import { fetchAiSettings } from "./ai-api.ts";
import { fetchGithubSettings } from "./github-api.ts";
import { fetchGrokBotSettings } from "./grok-bot-api.ts";
import { SECTION_FONTS, loadFonts } from "./load-fonts.ts";
import { fetchRedditAccount } from "./reddit-account-api.ts";
import { fetchRedditSettings } from "./reddit-api.ts";
import type { Loaded, SettingsLoad } from "./settings-load-types.ts";
import { fetchXSettings } from "./x-api.ts";

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

export function useSettingsLoad(
  page: RefObject<HTMLElement | null>,
  waitMs: number,
): SettingsLoad | null {
  const [loaded, setLoaded] = useState<SettingsLoad | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;

    const deadline = window.setTimeout(() => {
      controller.abort();
    }, waitMs);

    const load = async (): Promise<void> => {
      const { signal } = controller;

      const [ai, github, grokBot, reddit, redditAccount, tokens, x] = await Promise.all([
        settled(fetchAiSettings, signal),
        settled(fetchGithubSettings, signal),
        settled(fetchGrokBotSettings, signal),
        settled(fetchRedditSettings, signal),
        settled(fetchRedditAccount, signal),
        settled(fetchTokens, signal),
        settled(fetchXSettings, signal),
        page.current === null ? undefined : loadFonts(page.current, SECTION_FONTS, signal),
      ]);

      window.clearTimeout(deadline);

      if (mounted) setLoaded({ ai, github, grokBot, reddit, redditAccount, tokens, x });
    };

    void load();

    return () => {
      mounted = false;
      window.clearTimeout(deadline);
      controller.abort();
    };
  }, [page, waitMs]);

  return loaded;
}
