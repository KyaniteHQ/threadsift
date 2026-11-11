import { useEffect, useState } from "react";

import { type CliProvider, isCliProvider } from "../../src/core/ai-contract.ts";
import { type AiView, fetchAiSettings } from "./ai-api.ts";

export type ProviderNotice =
  | { readonly kind: "none" | "missing" }
  | { readonly kind: "plan"; readonly provider: CliProvider };

const NONE: ProviderNotice = { kind: "none" };

function noticeOf(settings: AiView["settings"]): ProviderNotice {
  if (settings === null) return { kind: "missing" };

  return isCliProvider(settings.provider) ? { kind: "plan", provider: settings.provider } : NONE;
}

export function useProviderNotice(): ProviderNotice {
  const [notice, setNotice] = useState(NONE);

  useEffect(() => {
    const controller = new AbortController();

    const read = async (): Promise<void> => {
      try {
        const { settings } = await fetchAiSettings(controller.signal);

        setNotice(noticeOf(settings));
      } catch {
        setNotice(NONE);
      }
    };

    void read();

    return () => {
      controller.abort();
    };
  }, []);

  return notice;
}
