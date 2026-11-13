import { useCallback, useMemo, useState } from "react";

import type { GrokBotView } from "../../src/core/grok-bot-contract.ts";
import type { XSettingsView } from "../../src/core/x-settings.ts";
import { GROK_BOT_SECTION } from "./GrokBotSection.tsx";
import type { SectionSpec } from "./LoadedSection.tsx";
import type { Loaded } from "./settings-load-types.ts";
import { fetchXSettings } from "./x-api.ts";

export function useXRefreshedByGrokBot(initial: Loaded<XSettingsView>) {
  const [x, setX] = useState(initial);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => {
    void fetchXSettings(new AbortController().signal).then(
      (view) => {
        setX({ kind: "ready", view });
        setVersion((current) => current + 1);

        return null;
      },
      () => null,
    );
  }, []);

  const grokBot = useMemo<SectionSpec<GrokBotView>>(
    () => ({
      ...GROK_BOT_SECTION,
      form: (view, changed) =>
        GROK_BOT_SECTION.form(view, (next) => {
          changed(next);
          refresh();
        }),
    }),
    [refresh],
  );

  return { x, version, grokBot };
}
