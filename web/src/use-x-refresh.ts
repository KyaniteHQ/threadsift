import { createElement, useCallback, useMemo, useState } from "react";

import type { GrokBotView } from "../../src/core/contract/grok-bot-contract.ts";
import type { XSettingsView } from "../../src/core/contract/x-settings-contract.ts";
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

  const grokBot = useMemo<SectionSpec<GrokBotView>>(() => {
    const Form: SectionSpec<GrokBotView>["Form"] = ({ view, changed }) => {
      const saved = (next: GrokBotView) => {
        changed(next);
        refresh();
      };

      return createElement(GROK_BOT_SECTION.Form, { view, changed: saved });
    };

    return { ...GROK_BOT_SECTION, Form };
  }, [refresh]);

  return { x, version, grokBot };
}
