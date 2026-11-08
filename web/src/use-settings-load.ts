import { useCallback, useEffect, useState } from "react";

import type { GithubSettingsView } from "../../src/core/github-contract.ts";
import { type AiView, fetchAiSettings } from "./ai-api.ts";
import { fetchGithubSettings } from "./github-api.ts";

export type Loaded<View> =
  | { readonly kind: "failed" }
  | { readonly kind: "ready"; readonly view: View };

export interface SettingsLoad {
  readonly ai: Loaded<AiView>;
  readonly github: Loaded<GithubSettingsView>;
}

async function settled<View>(load: () => Promise<View>): Promise<Loaded<View>> {
  try {
    return { kind: "ready", view: await load() };
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

export function useSettingsLoad(): SettingsLoad | null {
  const [loaded, setLoaded] = useState<SettingsLoad | null>(null);

  useEffect(() => {
    const load = async (): Promise<void> => {
      const [ai, github] = await Promise.all([
        settled(fetchAiSettings),
        settled(fetchGithubSettings),
      ]);

      setLoaded({ ai, github });
    };

    void load();
  }, []);

  return loaded;
}
